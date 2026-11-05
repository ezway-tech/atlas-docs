export class HttpError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status;}}
export function err(e:unknown,status=400){const message=e instanceof Error?e.message:String(e);const code=e instanceof HttpError?e.status:status;return Response.json({error:message},{status:code});}
