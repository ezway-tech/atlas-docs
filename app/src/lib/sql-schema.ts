export type SqlColumn={name:string;type:string;pk:boolean};
export type SqlTable={name:string;columns:SqlColumn[]};
export type SqlEdge={from:string;fromColumn:string;to:string;toColumn:string};
export type SqlSchema={tables:SqlTable[];edges:SqlEdge[];error?:string};

type AnyRecord=Record<string,unknown>;

function colName(column:unknown):string{
  if(typeof column==='string')return column;
  if(!column||typeof column!=='object')return '';
  const value=(column as AnyRecord).column??column;
  if(typeof value==='string')return value;
  if(value&&typeof value==='object'){
    const expr=(value as AnyRecord).expr;
    if(expr&&typeof expr==='object'&&typeof (expr as AnyRecord).value==='string')return (expr as AnyRecord).value as string;
  }
  return '';
}

function tableName(table:unknown):string{
  const item=Array.isArray(table)?table[0]:table;
  if(!item||typeof item!=='object')return '';
  return String((item as AnyRecord).table||'');
}

function names(list:unknown):string[]{
  return Array.isArray(list)?list.map(colName).filter(Boolean):[];
}

export function schemaFromAst(statements:unknown[]):SqlSchema{
  const tables:SqlTable[]=[];
  const edges:SqlEdge[]=[];
  for(const item of statements){
    if(!item||typeof item!=='object')continue;
    const stmt=item as AnyRecord;
    if(stmt.type!=='create'||String(stmt.keyword||'').toLowerCase()!=='table')continue;
    const name=tableName(stmt.table);
    if(!name)continue;
    const defs=Array.isArray(stmt.create_definitions)?stmt.create_definitions:[];
    const columns:SqlColumn[]=[];
    const pk=new Set<string>();
    for(const raw of defs){
      if(!raw||typeof raw!=='object')continue;
      const def=raw as AnyRecord;
      if(def.resource==='column'){
        const column=colName(def.column);
        if(!column)continue;
        const data=def.definition&&typeof def.definition==='object'?(def.definition as AnyRecord).dataType:'';
        if(def.primary_key)pk.add(column);
        columns.push({name:column,type:String(data||''),pk:!!def.primary_key});
        const ref=def.reference_definition;
        if(ref&&typeof ref==='object'){
          const target=tableName((ref as AnyRecord).table);
          const targetCols=names((ref as AnyRecord).definition);
          if(target)edges.push({from:name,fromColumn:column,to:target,toColumn:targetCols[0]||''});
        }
      }else if(String(def.constraint_type||'').toUpperCase()==='PRIMARY KEY'){
        for(const column of names(def.definition))pk.add(column);
      }else if(String(def.constraint_type||'').toUpperCase()==='FOREIGN KEY'&&def.reference_definition&&typeof def.reference_definition==='object'){
        const ref=def.reference_definition as AnyRecord;
        const fromCols=names(def.definition);
        const toCols=names(ref.definition);
        const target=tableName(ref.table);
        if(!target)continue;
        fromCols.forEach((column,index)=>{edges.push({from:name,fromColumn:column,to:target,toColumn:toCols[index]||toCols[0]||''});});
      }
    }
    for(const column of columns)column.pk=pk.has(column.name);
    tables.push({name,columns});
  }
  const known=new Set(tables.map(table=>table.name));
  for(const edge of edges){
    if(known.has(edge.to))continue;
    known.add(edge.to);
    tables.push({name:edge.to,columns:edge.toColumn?[{name:edge.toColumn,type:'',pk:true}]:[]});
  }
  return {tables,edges:edges.filter(edge=>edge.from&&edge.to)};
}

type ParserCtor=new()=>{astify:(sql:string,opt:{database:string})=>unknown};

export async function readSqlSchema(sql:string):Promise<SqlSchema>{
  if(!/create\s+table/i.test(sql))return {tables:[],edges:[]};
  const mod=await import('node-sql-parser') as {Parser?:ParserCtor;default?:{Parser?:ParserCtor}};
  const Parser=mod.Parser||mod.default?.Parser;
  if(!Parser)return {tables:[],edges:[],error:'Không tải được bộ đọc SQL.'};
  const parser=new Parser();
  let last='';
  for(const database of ['Postgresql','MySQL']){
    try{
      const ast=parser.astify(sql,{database});
      return schemaFromAst(Array.isArray(ast)?ast:[ast]);
    }catch(e){last=e instanceof Error?e.message:String(e);}
  }
  return {tables:[],edges:[],error:last||'Không đọc được SQL.'};
}
