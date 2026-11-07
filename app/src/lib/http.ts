import {AppError,isAppError} from './i18n/errors';

export class HttpError extends Error{
 status:number;
 constructor(message:string,status:number){
  super(message);
  this.status=status;
 }
}

export function err(e:unknown,status=400){
 if(isAppError(e)){
  return Response.json({error:e.message,errorKey:e.errorKey,params:e.params},{status:e.status});
 }
 const message=e instanceof Error?e.message:String(e);
 const code=e instanceof HttpError?e.status:status;
 // Legacy English/raw messages: expose as both error and errorKey when they look like keys
 const looksLikeKey=/^[a-z][a-z0-9.]*$/i.test(message)&&message.includes('.');
 return Response.json(looksLikeKey?{error:message,errorKey:message}:{error:message},{status:code});
}

export {AppError};
