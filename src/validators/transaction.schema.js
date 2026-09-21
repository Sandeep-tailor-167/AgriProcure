'use strict';
const { z } = require('zod');
const id = z.coerce.number().int().positive();
const decimal3 = z.union([z.string(),z.number()]).transform(String).pipe(z.string().regex(/^\d{1,9}(\.\d{1,3})?$/));
const money = z.union([z.string(),z.number()]).transform(String).pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/));
const idParamSchema = z.object({ id });
const inspectionSchema = z.object({ appointmentId:id, result:z.enum(['accepted','rejected','on_hold']), qualityGrade:z.string().trim().max(40).optional(), actualQuantity:decimal3, notes:z.string().trim().max(2000).optional() })
  .superRefine((v,c)=>{if(v.result!=='accepted'&&!v.notes)c.addIssue({code:'custom',path:['notes'],message:'A reason is required.'});});
const purchaseSchema = z.object({ acceptedQuantity:decimal3, rate:money, deductionAmount:money.default('0'), idempotencyKey:z.string().trim().min(12).max(100) });
const paymentSchema = z.object({ status:z.enum(['pending','initiated','completed','failed','unknown']), amount:money, verificationSource:z.string().trim().max(160).optional(), providerReference:z.string().trim().max(160).optional(), sourceRecord:z.record(z.string(),z.unknown()).optional() })
  .superRefine((v,c)=>{if(v.status==='completed'&&(!v.verificationSource||!v.providerReference))c.addIssue({code:'custom',path:['verificationSource'],message:'Completed payment requires authorised verification evidence.'});});
const correctionSchema = z.object({ actualQuantity:decimal3.optional(), acceptedQuantity:decimal3.optional(), rate:money.optional(), deductionAmount:money.optional(), reason:z.string().trim().min(10).max(1000) });
module.exports={idParamSchema,inspectionSchema,purchaseSchema,paymentSchema,correctionSchema};
