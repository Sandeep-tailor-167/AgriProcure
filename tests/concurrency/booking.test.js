'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateBookableSchedule, tokenNumber } = require('../../src/services/appointment.service');
const { estimate, allowed } = require('../../src/services/queue.service');
const appointmentRepository = require('../../src/repositories/appointment.repository');
const { getPool, withTransaction, closePool } = require('../../src/config/database');
test.after(closePool);

test('booking persistence uses a row lock and guarded final-slot update', () => {
  const repository = fs.readFileSync(path.resolve(__dirname, '../../src/repositories/appointment.repository.js'), 'utf8');
  assert.match(repository, /WHERE s\.schedule_id = \?\$\{lock \? ' FOR UPDATE'/);
  assert.match(repository, /booked_count < capacity/);
  assert.match(repository, /SET booked_count = booked_count \+ 1/);
  assert.match(repository, /queue_token_sequences/);
});

test('bookable schedule rules reject full, closed, and unpublished slots', () => {
  const base = { schedule_id: 1, schedule_status: 'published', centre_status: 'open', procurement_date: '2099-01-01', booked_count: 0, capacity: 1 };
  assert.doesNotThrow(() => validateBookableSchedule(base));
  assert.throws(() => validateBookableSchedule({ ...base, booked_count: 1 }), (error) => error.code === 'CAPACITY_FULL');
  assert.throws(() => validateBookableSchedule({ ...base, centre_status: 'closed' }), (error) => error.code === 'CENTRE_CLOSED');
  assert.throws(() => validateBookableSchedule({ ...base, schedule_status: 'draft' }), (error) => error.code === 'SCHEDULE_NOT_AVAILABLE');
});

test('token number is deterministic, scoped, short, and sequence padded', () => {
  const token = tokenNumber({ centre_code: 'DEMO-KRL-001', crop_code: 'WHEAT' }, 42);
  assert.equal(token, 'KRL-001-WHE-00042');
  assert.ok(token.length <= 32);
});

test('live MySQL final-slot concurrency: multiple farmers produce one confirmation', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async () => {
  const pool=getPool();const stamp=String(Date.now());const phoneBase=stamp.slice(-10);let ids={users:[],farmers:[]};
  try {
    const [admin]=await pool.execute("INSERT INTO users(full_name,phone,role,account_status,phone_verified_at) VALUES('Concurrency Admin',?,'admin','active',UTC_TIMESTAMP(3))",[phoneBase]);ids.users.push(admin.insertId);
    const [centre]=await pool.execute("INSERT INTO procurement_centres(centre_code,centre_name,address_line,district,state,opening_time,closing_time,physical_daily_capacity,centre_status,created_by) VALUES(?, '[TEST] Concurrency Centre','Test only','Test','Test','08:00','17:00',1,'open',?)",[`TEST-${stamp}`,admin.insertId]);ids.centre=centre.insertId;
    const [crop]=await pool.execute("INSERT INTO crops(crop_code,crop_name_en,crop_name_hi,quantity_unit,crop_status) VALUES(?,?,?,'quintal','active')",[`T${stamp}`,`Test crop ${stamp}`,`Test crop ${stamp}`]);ids.crop=crop.insertId;
    await pool.execute('INSERT INTO centre_crops(centre_id,crop_id) VALUES(?,?)',[ids.centre,ids.crop]);
    for(let i=1;i<=2;i++){const phone=String(BigInt(phoneBase)+BigInt(i));const [u]=await pool.execute("INSERT INTO users(full_name,phone,role,account_status,phone_verified_at) VALUES(? ,?,'farmer','active',UTC_TIMESTAMP(3))",[`Concurrency Farmer ${i}`,phone]);ids.users.push(u.insertId);const [f]=await pool.execute('INSERT INTO farmers(farmer_code,user_id,district,state) VALUES(?,?,?,?)',[`F-${stamp}-${i}`,u.insertId,'Test','Test']);ids.farmers.push(f.insertId);}
    const [schedule]=await pool.execute("INSERT INTO procurement_schedules(centre_id,crop_id,procurement_date,start_time,end_time,capacity,schedule_status,created_by,published_at) VALUES(?,?,DATE_ADD(UTC_DATE(),INTERVAL 2 DAY),'09:00','10:00',1,'published',?,UTC_TIMESTAMP(3))",[ids.centre,ids.crop,admin.insertId]);ids.schedule=schedule.insertId;
    const attempt=(farmerId,index)=>withTransaction(async connection=>{const locked=await appointmentRepository.findScheduleForBooking(ids.schedule,connection,true);validateBookableSchedule(locked);if(!await appointmentRepository.reserveScheduleCapacity(ids.schedule,connection))return false;await appointmentRepository.insertAppointment({bookingReference:`C-${stamp}-${index}`,farmerId,scheduleId:ids.schedule,estimatedQuantity:'1.000'},connection);return true;}).catch(error=>['CAPACITY_FULL','SCHEDULE_NOT_AVAILABLE'].includes(error.code)?false:Promise.reject(error));
    const outcomes=await Promise.all(ids.farmers.map(attempt));const [counts]=await pool.execute("SELECT booked_count,(SELECT COUNT(*) FROM appointments WHERE schedule_id=? AND booking_status='confirmed') confirmations FROM procurement_schedules WHERE schedule_id=?",[ids.schedule,ids.schedule]);
    assert.equal(outcomes.filter(Boolean).length,1);assert.equal(Number(counts[0].booked_count),1);assert.equal(Number(counts[0].confirmations),1);
  } finally {
    if(ids.schedule)await pool.execute('DELETE FROM appointments WHERE schedule_id=?',[ids.schedule]);
    if(ids.schedule)await pool.execute('DELETE FROM procurement_schedules WHERE schedule_id=?',[ids.schedule]);
    if(ids.centre&&ids.crop)await pool.execute('DELETE FROM centre_crops WHERE centre_id=? AND crop_id=?',[ids.centre,ids.crop]);
    for(const farmer of ids.farmers)await pool.execute('DELETE FROM farmers WHERE farmer_id=?',[farmer]);
    if(ids.centre)await pool.execute('DELETE FROM procurement_centres WHERE centre_id=?',[ids.centre]);
    if(ids.crop)await pool.execute('DELETE FROM crops WHERE crop_id=?',[ids.crop]);
    for(const user of ids.users.reverse())await pool.execute('DELETE FROM users WHERE user_id=?',[user]);
  }
});

test('simultaneous next-token operations use a locked ordered claim', () => {
  const repository = fs.readFileSync(path.resolve(__dirname, '../../src/repositories/queue.repository.js'), 'utf8');
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /ORDER BY qt\.priority_rank, qt\.check_in_time, qt\.token_id/);
  assert.match(repository, /WHERE token_id = \? AND queue_status IN/);
});

test('queue estimate is rate-based and paused queues do not promise a time', () => {
  assert.equal(estimate({ farmers_ahead: 5, avg_service_minutes: 12, active_counters: 2, queue_state: 'running' }).estimated_wait_minutes, 30);
  assert.equal(estimate({ farmers_ahead: 5, avg_service_minutes: 12, active_counters: 2, queue_state: 'paused' }).estimated_wait_minutes, null);
  assert.deepEqual(allowed.called, ['in_service', 'no_show']);
  assert.ok(!allowed.called.includes('completed'));
});
