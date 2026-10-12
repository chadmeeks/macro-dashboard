'use strict';
const URL='https://charts.bgeometrics.com/files/glm2_in.json';
function parseGlobalM2(payload,today=new Date().toISOString().slice(0,10)){
 if(!Array.isArray(payload)||!payload.length)throw new Error('Global M2 source returned no observations');
 const seen=new Set(),history=[];
 for(const row of payload){
  if(!Array.isArray(row)||row.length!==2||!Number.isFinite(row[0])||!Number.isFinite(row[1])||row[1]<=0)throw new Error('Invalid Global M2 observation');
  const time=new Date(row[0]);if(!Number.isFinite(time.getTime()))throw new Error('Invalid Global M2 date');
  const date=time.toISOString().slice(0,10);
  if(seen.has(date))throw new Error('Duplicate Global M2 date');seen.add(date);
  if(date<=today)history.push({date,value:row[1]});
 }
 history.sort((a,b)=>a.date.localeCompare(b.date));
 if(!history.length)throw new Error('No completed Global M2 observations');
 return {history,asOf:history.at(-1).date,source:'BGeometrics',url:'https://charts.bgeometrics.com/m2_global.html',unit:'USD',coverage:'Provider aggregate covering 21 economies; not every country.',method:'USD-denominated broad-money aggregate. Exchange-rate changes affect its value. Constituent publication dates and historical vintages are not supplied.'};
}
module.exports={parseGlobalM2,URL};
