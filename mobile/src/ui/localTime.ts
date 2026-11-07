// Numeric local time stays readable when Hermes lacks the requested locale data.
export function localTime(value:string|number,clockOnly=false):string {
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '时间未记录';
 const pad=(part:number)=>String(part).padStart(2,'0');
 const clock=`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
 return clockOnly?clock:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${clock}`;
}
