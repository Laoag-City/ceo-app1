// JSON stays serialized text to match the existing registry controller contract.
module.exports=`SELECT p.*,
 (SELECT json_agg(lot_number ORDER BY id)::text FROM permit_lots WHERE permit_id=p.id) AS lot_numbers,
 (SELECT json_agg(json_build_object('id',id,'discipline',COALESCE(discipline_name,''),'status',COALESCE(signature_status,'Pending'),'date_checked',date_checked,'date_approved',date_approved) ORDER BY id)::text FROM permit_routing_matrix WHERE permit_id=p.id) AS routing_tracks,
 (SELECT json_agg(json_build_object('id',sub.id,'title',sub.sub_project_title,'tracks',COALESCE((SELECT json_agg(json_build_object('id',m.id,'discipline',COALESCE(m.discipline_name,''),'status',COALESCE(m.signature_status,'Pending'),'date_checked',m.date_checked,'date_approved',m.date_approved) ORDER BY m.id)::text FROM permit_routing_matrix m WHERE m.sub_permit_id=sub.id),'[]')) ORDER BY sub.id)::text FROM sub_permits sub WHERE sub.permit_id=p.id) AS sub_permits
 FROM permits p ORDER BY p.id DESC`;
