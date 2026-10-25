import { Router } from 'express';
import { z } from 'zod';

const router = Router();
const categories = ['Suspicious Activity','Following / Stalking Concern','Harassment','Unsafe Environment','Campus Safety Concern','Workplace Safety Concern','Public Transport Safety Concern','Other'];
const fail = (res, error, status = 400) => res.status(status).json({ error });
const cleanError = (e) => e?.message || 'The request could not be completed.';

router.get('/me', async (req, res) => {
  const { data, error } = await req.db.from('profiles').select('id,display_name,role,preferences').eq('id', req.user.id).maybeSingle();
  if (error) return fail(res, cleanError(error), 500);
  if (!data) {
    const display_name = req.user.user_metadata?.display_name || req.user.email?.split('@')[0] || 'HerWay member';
    const created = await req.db.from('profiles').insert({ id: req.user.id, display_name }).select('id,display_name,role,preferences').single();
    if (created.error) return fail(res, cleanError(created.error), 500);
    return res.json(created.data);
  }
  res.json(data);
});

router.patch('/me', async (req, res) => {
  const schema = z.object({ display_name: z.string().trim().min(1).max(80).optional(), role: z.enum(['user','guardian']).optional(), preferences: z.record(z.string(), z.boolean()).optional() }).strict();
  const parsed = schema.safeParse(req.body); if (!parsed.success) return fail(res, 'Enter a valid name or settings.');
  const { data, error } = await req.db.from('profiles').upsert({ id: req.user.id, ...parsed.data }, { onConflict: 'id' }).select('id,display_name,role,preferences').single();
  if (error) return fail(res, cleanError(error), 500); res.json(data);
});

router.get('/guardians', async (req, res) => {
  const { data, error } = await req.db.from('guardians').select('id,contact_email,display_name,relationship,status,created_at').eq('owner_id', req.user.id).order('created_at');
  if (error) return fail(res, cleanError(error), 500); res.json(data);
});
router.post('/guardians', async (req, res) => {
  const p = z.object({ contact_email: z.string().trim().email().max(254), display_name: z.string().trim().min(1).max(80), relationship: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!p.success) return fail(res, 'Provide a valid email, name, and relationship.');
  if (p.data.contact_email.toLowerCase() === req.user.email?.toLowerCase()) return fail(res, 'You cannot add your own account as a Guardian.');
  const { data, error } = await req.db.from('guardians').insert({ ...p.data, contact_email: p.data.contact_email.toLowerCase(), owner_id: req.user.id }).select('id,contact_email,display_name,relationship,status,created_at').single();
  if (error) return fail(res, error.code === '23505' ? 'That email is already on your Guardian list.' : cleanError(error), error.code === '23505' ? 409 : 500);
  res.status(201).json(data);
});
router.delete('/guardians/:id', async (req, res) => {
  const { error, count } = await req.db.from('guardians').delete({ count: 'exact' }).eq('id', req.params.id).eq('owner_id', req.user.id);
  if (error) return fail(res, cleanError(error), 500); if (!count) return fail(res, 'Guardian not found.', 404); res.status(204).end();
});

router.get('/journeys', async (req, res) => {
  const { data, error } = await req.db.from('journeys').select('id,origin,destination,travel_mode,status,expected_arrival,started_at,arrived_at,journey_guardians(guardian_id,guardians(id,display_name,contact_email))').eq('owner_id', req.user.id).order('started_at', { ascending: false }).limit(50);
  if (error) return fail(res, cleanError(error), 500); res.json(data);
});
router.get('/guardian/journeys', async (req,res)=>{
  if(!req.user.email || !req.user.email_confirmed_at)return fail(res,'Verify your account email before viewing shared journeys.',403);
  const {data,error}=await req.db.from('journey_guardians').select('journey:journeys(id,origin,destination,travel_mode,status,expected_arrival,started_at,arrived_at,owner:profiles(display_name))').eq('contact_email',req.user.email.toLowerCase()).order('created_at',{ascending:false}).limit(100);
  if(error)return fail(res,cleanError(error),500);res.json(data.map(row=>row.journey).filter(Boolean));
});
router.post('/routes', async (req, res) => {
  const p = z.object({ origin: z.string().trim().min(2).max(180), destination: z.string().trim().min(2).max(180), travel_mode: z.enum(['walk','transit','drive']) }).safeParse(req.body);
  if (!p.success) return fail(res, 'Enter an origin, destination, and travel mode.');
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: 'Route planning is not configured yet. Add MAPBOX_ACCESS_TOKEN on the server to enable real directions.' });
  try {
    const geocode = async (q) => {
      const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
      url.search = new URLSearchParams({ access_token: token, limit: '1' });
      const r = await fetch(url); if (!r.ok) throw new Error('Location lookup is temporarily unavailable.');
      const json = await r.json(); if (!json.features?.[0]) throw new Error(`We could not find “${q}”. Try a more specific place or address.`);
      return json.features[0].center;
    };
    const [a,b] = await Promise.all([geocode(p.data.origin), geocode(p.data.destination)]);
    const profile = p.data.travel_mode === 'walk' ? 'walking' : p.data.travel_mode === 'drive' ? 'driving' : 'driving-traffic';
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${a.join(',')};${b.join(',')}`);
    url.search = new URLSearchParams({ access_token: token, alternatives: 'true', geometries: 'geojson', overview: 'simplified', steps: 'false' });
    const r = await fetch(url); if (!r.ok) throw new Error('Directions are temporarily unavailable. Please try again later.');
    const json = await r.json();
    if (!json.routes?.length) throw new Error('No route was found for those locations.');
    res.json({ routes: json.routes.map((route, i) => ({ id: `route-${i}`, label: i === 0 ? 'Suggested route' : `Alternative ${i}`, distance_m: Math.round(route.distance), duration_s: Math.round(route.duration), geometry: route.geometry.coordinates, origin: p.data.origin, destination: p.data.destination, travel_mode: p.data.travel_mode })), advisory: 'Directions and travel times come from Mapbox. HerWay AI has no verified safety or Safe Point data for these routes.' });
  } catch (e) { fail(res, cleanError(e), 502); }
});
router.post('/journeys', async (req, res) => {
  const p = z.object({ origin:z.string().trim().min(1).max(180),destination:z.string().trim().min(1).max(180),travel_mode:z.enum(['walk','transit','drive']),expected_arrival:z.string().datetime().optional(),guardian_ids:z.array(z.string().uuid()).max(30).default([]) }).safeParse(req.body);
  if (!p.success) return fail(res, 'Journey details are invalid.');
  if (p.data.guardian_ids.length) {
    const { data, error } = await req.db.from('guardians').select('id').eq('owner_id',req.user.id).in('id',p.data.guardian_ids);
    if (error || data.length !== new Set(p.data.guardian_ids).size) return fail(res, 'Choose Guardians from your own list.');
  }
  const { data: journey, error } = await req.db.from('journeys').insert({ owner_id:req.user.id, origin:p.data.origin, destination:p.data.destination, travel_mode:p.data.travel_mode, expected_arrival:p.data.expected_arrival || null, status:'active' }).select('id,origin,destination,travel_mode,status,expected_arrival,started_at').single();
  if (error) return fail(res, cleanError(error), 500);
  if (p.data.guardian_ids.length) {
    const { data: contacts } = await req.db.from('guardians').select('id,contact_email').eq('owner_id',req.user.id).in('id',p.data.guardian_ids);
    const linked = await req.db.from('journey_guardians').insert(contacts.map(g => ({ journey_id:journey.id,guardian_id:g.id,contact_email:g.contact_email })));
    if (linked.error) { await req.db.from('journeys').delete().eq('id',journey.id).eq('owner_id',req.user.id); return fail(res, cleanError(linked.error), 500); }
  }
  res.status(201).json(journey);
});
router.patch('/journeys/:id', async (req,res) => {
  const p=z.object({ status:z.enum(['active','completed','cancelled']), expected_arrival:z.string().datetime().optional() }).strict().safeParse(req.body); if(!p.success)return fail(res,'Invalid journey update.');
  const patch={status:p.data.status}; if(p.data.status==='completed')patch.arrived_at=new Date().toISOString(); if(p.data.status==='active')patch.arrived_at=null; if(p.data.expected_arrival)patch.expected_arrival=p.data.expected_arrival;
  const {data,error}=await req.db.from('journeys').update(patch).eq('id',req.params.id).eq('owner_id',req.user.id).select('id,status,arrived_at,expected_arrival').maybeSingle();
  if(error)return fail(res,cleanError(error),500); if(!data)return fail(res,'Journey not found.',404); res.json(data);
});

router.get('/incidents',async(req,res)=>{const {data,error}=await req.db.from('incidents').select('id,description,category,location_shared,status,created_at').eq('owner_id',req.user.id).order('created_at',{ascending:false}).limit(100);if(error)return fail(res,cleanError(error),500);res.json(data);});
router.post('/incidents',async(req,res)=>{
  const p=z.object({description:z.string().trim().min(5).max(10000),category:z.enum(categories),location_shared:z.boolean().default(false)}).safeParse(req.body);if(!p.success)return fail(res,'Add at least five characters and choose a category.');
  const {data,error}=await req.db.from('incidents').insert({...p.data,owner_id:req.user.id}).select('id,description,category,location_shared,status,created_at').single();if(error)return fail(res,cleanError(error),500);
  res.status(201).json({...data,analysis:{message:'Your report has been saved for review. HerWay AI does not assign a danger score or infer facts from your description.',category:data.category}});
});
router.delete('/incidents/:id',async(req,res)=>{const {error,count}=await req.db.from('incidents').delete({count:'exact'}).eq('id',req.params.id).eq('owner_id',req.user.id);if(error)return fail(res,cleanError(error),500);if(!count)return fail(res,'Report not found.',404);res.status(204).end();});

router.post('/emergency',async(req,res)=>{
  const p=z.object({action:z.enum(['guardian_contact','urgent_report'])}).safeParse(req.body);if(!p.success)return fail(res,'Choose a valid emergency action.');
  if(p.data.action==='urgent_report'){
    const {data,error}=await req.db.from('incidents').insert({owner_id:req.user.id,description:'Urgent assistance requested using Emergency Mode.',category:'Other',status:'urgent'}).select('id,status,created_at').single();if(error)return fail(res,cleanError(error),500);return res.status(201).json({message:'Urgent request recorded in your account. No emergency service or Guardian has been contacted.',incident:data});
  }
  const {data,error}=await req.db.from('guardians').select('id,display_name,contact_email').eq('owner_id',req.user.id);if(error)return fail(res,cleanError(error),500);
  res.json({message:'Your Guardian contact details are ready. No call, text, or notification was sent.',guardians:data});
});

export default router;
