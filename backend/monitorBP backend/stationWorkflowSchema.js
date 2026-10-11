// PostgreSQL CREATE calls validate tables prepared by Apply-PermitStationWorkflow.ps1.
// MySQL installations may create the same additive schema at startup.
module.exports=async db=>{
    await db.query(`CREATE TABLE IF NOT EXISTS permit_station_assignments (
        user_id INT NOT NULL, station_key VARCHAR(120) NOT NULL,
        station_name VARCHAR(100) NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id,station_key), INDEX station_assignment_station (station_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    if(db.dialect==='mysql' || process.env.DB_ENGINE==='mysql')await require('./stationAssignmentsMysql')(db);
    await db.query(`CREATE TABLE IF NOT EXISTS permit_final_reviews (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(16) NOT NULL,
        project_id INT NOT NULL, decision VARCHAR(16) NOT NULL, reviewer_id INT,
        reviewer_name VARCHAR(100) NOT NULL, remarks TEXT NOT NULL,
        snapshot_hash CHAR(64) NOT NULL, snapshot JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
};
