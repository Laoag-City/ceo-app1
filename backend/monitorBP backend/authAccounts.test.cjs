const {test}=require('node:test');
const assert=require('node:assert/strict');
const createAuth=require('./authServer');
function fixture() {
    let reads=0;
    const users=[{id:1,username:'operator',role:'operator'},{id:2,username:'reviewer',role:'admin'},{id:3,username:'it',role:'superadmin'}];
    const db={promise:()=>({query:async sql=>{
        reads++;
        if(sql.startsWith('SELECT id,username,role,'))return [users];
        if(sql.startsWith('SELECT user_id,station_name'))return [[{user_id:1,station_name:'Electrical'},{user_id:2,station_name:'Electrical'},{user_id:2,station_name:'Sanitary'},{user_id:3,station_name:'Mechanical'}]];
        throw Error('Unexpected query');
    }})};
    const pass=(req,res,next)=>next();
    const router=createAuth(db,{requireUser:pass,requireRoles:()=>pass},()=>assert.fail('Read-only list opened a write connection'));
    const route=router.stack.find(layer=>layer.route?.path==='/accounts'&&layer.route.methods.get).route;
    async function request(role) {
        const req={user:{id:3,role}},res={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
        for(const layer of route.stack){let next=false;await layer.handle(req,res,()=>{next=true;});if(!next)break;}
        return res;
    }
    return {request,reads:()=>reads};
}
test('account listing includes operator/admin assignments but never enables IT station editing',async()=>{
    const {request,reads}=fixture(),res=await request('superadmin');
    assert.equal(res.code,200);assert.equal(reads(),2);
    assert.deepEqual(res.body.users.map(user=>user.assigned_stations),[['Electrical'],['Electrical','Sanitary'],[]]);
    assert.equal(res.body.users[1].assigned_station,'Electrical');assert.equal(res.body.users[2].assigned_station,null);
});
test('admins and operators still cannot list/manage accounts',async()=>{
    const {request,reads}=fixture();
    for(const role of ['admin','operator'])assert.equal((await request(role)).code,403);
    assert.equal(reads(),0);
});
