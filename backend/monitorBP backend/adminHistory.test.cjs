require('../database/admin-history.scenarios.cjs')(()=>require('mysql2/promise').createConnection({host:'localhost',user:'root',database:'permit_system'}),'mysql');
