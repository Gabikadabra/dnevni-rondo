export const LETTERS = ["A","B","C","Č","Ć","D","Dž","Đ","E","F","G","H","I","J","K","L","Lj","M","N","Nj","O","P","R","S","Š","T","U","V","Z","Ž"] as const;
export type Letter = typeof LETTERS[number];
export function norm(s:string){return s.toLocaleLowerCase("hr-HR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/dž/g,"dz").replace(/lj/g,"l").replace(/nj/g,"n").replace(/[^a-z0-9]/g,"");}
export function startsWithLetter(answer:string,letter:string){return norm(answer).startsWith(norm(letter));}
export function closeEnough(input:string,target:string){const a=norm(input),b=norm(target);if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,e=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++e>1)return false;if(a.length===b.length){i++;j++;}else if(a.length>b.length)i++;else j++;}return e+(i<a.length||j<b.length?1:0)<=1;}
