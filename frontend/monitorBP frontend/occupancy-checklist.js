/** Shared requirement labels for the workspace and printable summaries. */
window.OccupancyChecklist = [
    { section:'Primary Documents', items:[
        {id:'cl01',title:'Duly Accomplished Application Form',note:'Signed by owner / authorized representative',req:true},
        {id:'cl02',title:'Building Permit (Original or CTC)',note:'With corresponding official receipt',req:true},
        {id:'cl03',title:'Certificate of Final Electrical Inspection (CFEI)',note:'Issued by the Office of the Building Official',req:true},
        {id:'cl04',title:'Certificate of Final Mechanical Inspection (CFMI)',note:'If mechanical works are involved',req:false},
        {id:'cl_new1',title:'Photocopy of Valid Licenses',note:'Valid licenses of all involved professionals',req:true},
        {id:'cl_new2',title:'Construction Logbook',note:"Signed by the owner's architect or civil engineer who undertook full-time inspection and supervision",req:true}
    ]},
    { section:'Plans & Technical Documents', items:[
        {id:'cl05',title:'As-Built Architectural & Civil Plans',note:'Signed and sealed by respective PRC licensees',req:false},
        {id:'cl06',title:'As-Built Electrical Plans',note:'Signed and sealed by licensed Electrical Engineer',req:false},
        {id:'cl07',title:'As-Built Sanitary / Plumbing Plans',note:'If applicable',req:false},
        {id:'cl08',title:'As-Built Mechanical Plans',note:'If applicable',req:false},
        {id:'cl09',title:'Structural Stability Certificate',note:'From the Structural Engineer of Record',req:false},
        {id:'cl_new3',title:'Captioned Photographs of Site',note:'Completed building/structure showing front, sides, and rear areas.',req:false}
    ]},
    { section:'Clearances & Certifications', items:[
        {id:'cl10',title:'BFP Fire Safety Inspection Certificate',note:'Bureau of Fire Protection — for all occupancy types',req:true},
        {id:'cl11',title:'Certification from zoning',note:'Issued by the local zoning office',req:true}
    ]},
    { section:'Proof of Payments', items:[
        {id:'cl16',title:"Contractor's Affidavit of Completion",note:'Notarized, if applicable',req:false}
    ]}
];
