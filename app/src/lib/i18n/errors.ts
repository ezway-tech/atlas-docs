import {DEFAULT_LOCALE} from './locales';
import {translate,type TranslateParams} from './translate';

export class AppError extends Error{
 errorKey:string;
 status:number;
 params?:TranslateParams;
 constructor(errorKey:string,status=400,params?:TranslateParams){
  super(translate(DEFAULT_LOCALE,errorKey,params));
  this.errorKey=errorKey;
  this.status=status;
  this.params=params;
 }
}

export function isAppError(e:unknown):e is AppError{
 return e instanceof AppError;
}
