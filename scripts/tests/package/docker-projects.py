"""Docker Projects acceptance test. Uses only uniquely named temporary volumes."""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

image = sys.argv[1] if len(sys.argv) > 1 else 'ezwaytechvn/atlas-docs:6.0.0'
prefix = 'atlas-projects-test-' + uuid.uuid4().hex[:10]
container = prefix
volumes = [prefix + '-' + kind for kind in ['libraries', 'registry', 'backups', 'legacy']]
base = None


def docker(*args, check=True):
    return subprocess.run(['docker', *args], text=True, capture_output=True, check=check).stdout.strip()


def start(extra=(), selected_image=image):
    global base
    docker('run', '-d', '--name', container, '-p', '127.0.0.1::3000',
           '-v', volumes[0] + ':/libraries', '-v', volumes[1] + ':/atlas-registry',
           '-v', volumes[2] + ':/upgrade-backups', *extra, selected_image)
    port = docker('port', container, '3000/tcp').rsplit(':', 1)[1]
    base = 'http://127.0.0.1:' + port
    return ready()


def request(route, body=None, session=None):
    headers = {'Content-Type': 'application/json', 'X-Atlas-Library-Api': '1', 'Origin': base}
    if session:
        headers.update({'X-Atlas-Runtime': session['runtimeId'], 'X-Atlas-Library': session['libraryId']})
    req = urllib.request.Request(base + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def ready(want=None):
    for _ in range(240):
        try:
            status, value = request('/api/libraries/ready')
            if status == 200 and value.get('ok'):
                status, session = request('/api/libraries/session')
                if status == 200 and (want is None or session['libraryRoot'] == want):
                    return session
        except (OSError, ValueError):
            pass
        time.sleep(.5)
    raise AssertionError('Runtime did not become ready: ' + docker('logs', container))


def stop():
    docker('stop', '-t', '20', container, check=False)
    docker('rm', '-f', container, check=False)


def snapshot(root):
    return docker('exec', container, 'node', '-e',
                  "const fs=require('fs'),p=require('path'),c=require('crypto');const out={};"
                  "function walk(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){"
                  "const key=rel+e.name;if(e.isDirectory())walk(p.join(dir,e.name),key+'/');"
                  "else out[key]=c.createHash('sha256').update(fs.readFileSync(p.join(dir,e.name))).digest('hex')}}"
                  "for(const x of ['docs','uploads','history'])walk(p.join(process.argv[1],x),x+'/');"
                  "out['db.json']=fs.readFileSync(p.join(process.argv[1],'db.json'),'utf8');console.log(JSON.stringify(out));", root)


try:
    session = start()
    status, projects = request('/api/libraries/recent', session=session)
    assert status == 200 and len(projects['libraries']) == 1, projects
    example = projects['libraries'][0]
    assert example['isExample'] and example['displayName'] == 'Example', example
    assert session['mode'] == 'library'
    with urllib.request.urlopen(base) as response:
        assert response.url.endswith('/projects'), response.url
    for name in ['db.json', 'docs', 'uploads', 'history', 'AGENTS.md', '.atlas/guides/agent-guide.md']:
        docker('exec', container, 'test', '-e', example['path'] + '/' + name)
    docker('exec', container, 'node', '-e',
           "const fs=require('fs');fs.mkdirSync(process.argv[1]+'/docs/check',{recursive:true});"
           "fs.writeFileSync(process.argv[1]+'/docs/check/kept.md','# Example edit');", example['path'])
    example_before = snapshot(example['path'])
    status, created = request('/api/libraries/create', {'name': 'My project', 'parentDir': '/libraries'}, session)
    assert status == 202, (status, created)
    target = created.get('root') or created.get('path')
    assert target, created
    session = ready(target)
    docker('exec', container, 'node', '-e',
           "const fs=require('fs');fs.mkdirSync(process.argv[1]+'/docs/check',{recursive:true});"
           "fs.writeFileSync(process.argv[1]+'/docs/check/kept.md','# Project edit');", target)
    before = snapshot(target)
    # Recreate with the same volumes; registry and both project payloads must survive.
    stop()
    session = start()
    assert session['libraryRoot'] == target, session
    assert snapshot(target) == before
    assert snapshot(example['path']) == example_before
    status, projects = request('/api/libraries/recent', session=session)
    assert status == 200 and len(projects['libraries']) == 2, projects
    assert sum(bool(p['isExample']) for p in projects['libraries']) == 1
    # A generated docs-only directory is rejected without inventing a database.
    docker('exec', container, 'mkdir', '-p', '/libraries/uninitialized/docs')
    status, invalid = request('/api/libraries/open', {'path': '/libraries/uninitialized'}, session)
    assert status >= 400, invalid
    docker('exec', container, 'test', '!', '-e', '/libraries/uninitialized/db.json')
    status, outside = request('/api/libraries/open', {'path': '/etc'}, session)
    assert status >= 400, outside
    stop()
    # Old launcher settings fail explicitly rather than silently opening another library.
    rejected = subprocess.run(['docker', 'run', '--rm', '-e', 'DATA_DIR=/data', image], capture_output=True, text=True)
    assert rejected.returncode != 0 and 'Remove DATA_DIR' in rejected.stderr, rejected.stderr
    # Prepare a real v5 library in its old /data mount, then open it in v6 in place.
    docker('run', '-d', '--name', container, '-v', volumes[3] + ':/data', 'ezwaytechvn/atlas-docs:5.4.0')
    for _ in range(120):
        result = subprocess.run(['docker', 'exec', container, 'test', '-f', '/data/db.json'], capture_output=True)
        if result.returncode == 0:
            break
        time.sleep(.5)
    docker('exec', container, 'node', '-e', "const fs=require('fs');fs.mkdirSync('/data/docs/old',{recursive:true});fs.writeFileSync('/data/docs/old/kept.md','# Old project');")
    old_before = snapshot('/data')
    stop()
    session = start(('-v', volumes[3] + ':/libraries/legacy', '-e', 'ATLAS_OPEN_LIBRARY=/libraries/legacy'))
    assert session['libraryRoot'] == '/libraries/legacy'
    assert snapshot('/libraries/legacy') == old_before
    print('PASS: Docker Example, create/switch, agent-kit, recreate persistence, invalid folders, obsolete config, v5 volume opened in v6')
except Exception:
    print(docker('logs', container, check=False))
    raise
finally:
    stop()
    for volume in volumes:
        docker('volume', 'rm', volume, check=False)
