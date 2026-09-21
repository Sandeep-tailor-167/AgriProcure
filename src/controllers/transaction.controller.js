'use strict';
const service=require('../services/transaction.service');
const notifications=require('../services/notification.service');
const actor=r=>({userId:r.auth.userId,role:r.auth.role});
async function notify(data,eventType,title,message){try{await notifications.create({userId:data.farmer_user_id,eventType,title,message,data:{transactionId:data.transaction_id},deduplicationKey:`${eventType}:${data.transaction_id}:${data.transaction_status}`});}catch(e){console.error('Transaction notification failed',e.code||e.message);}}
async function inspect(r,s){const data=await service.inspect(r.body,actor(r));await notify(data,'inspection_update','Inspection updated',`Inspection status: ${data.transaction_status}.`);s.status(201).json({success:true,data});}
async function purchase(r,s){s.status(201).json({success:true,data:await service.purchase(Number(r.params.id),r.body,actor(r))});}
async function payment(r,s){const data=await service.payment(Number(r.params.id),r.body,actor(r));await notify(data,'payment_update','Payment status updated',`Recorded payment status: ${data.transaction_status}.`);s.status(201).json({success:true,data});}
async function correction(r,s){s.json({success:true,data:await service.correction(Number(r.params.id),r.body,actor(r))});}
async function mine(r,s){s.json({success:true,data:await service.mine(r.auth.userId)});}
async function list(r,s){s.json({success:true,data:await service.centreHistory(Number(r.query.centreId),actor(r))});}
module.exports={inspect,purchase,payment,correction,mine,list};
