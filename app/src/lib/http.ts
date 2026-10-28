export function err(e:unknown,status=400){const message=e instanceof Error?e.message:String(e);return Response.json({error:message},{status});}
