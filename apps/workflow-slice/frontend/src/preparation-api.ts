import {api} from './api';
export const preparationApi=<T>(path:string,method='GET',body?:unknown,key?:string,signal?:AbortSignal)=>api<T>('rep',path,method,body,key,signal,'preparation-1');
