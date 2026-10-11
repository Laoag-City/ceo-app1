require('../database/station-workflow.scenarios.cjs')(()=>require('mysql2/promise').createConnection({host:'localhost',user:'root',password:'',database:'permit_system'}),'mysql');
