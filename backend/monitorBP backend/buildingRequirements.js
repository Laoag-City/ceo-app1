/* One source for the Building workspace, audit labels and printed summaries.
 * Transcribed from the office's supplied requirements sheet. Conditions are
 * shown to staff; the checklist does not change final-approval rules. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else root.BuildingRequirements=factory();
})(typeof window==='object'?window:globalThis,()=>({
    sections:[
        {section:'Ownership and clearances',items:[
            {id:'land_title',number:'1',title:'Certified True Copy of Land Title / Proof of Ownership',note:'Deed of Absolute Sale, Deed of Donation, Deed of Adjudication, or other valid mode of acquisition; Consent / SPA.',req:true},
            {id:'tax_declaration',number:'2',title:'Certified True Copy of Tax Declaration',note:'With documentary stamp.',req:true},
            {id:'tax_receipt',number:'3',title:'Latest Tax Receipt',note:'Photocopy or CND.',req:true},
            {id:'barangay_clearance',number:'4',title:'Barangay Clearance',note:'Indicating specific purpose: Construction / Fence / Demolition.',req:true}
        ]},
        {section:'Plans and technical documents',items:[
            {id:'plans',number:'5',title:'Sets of Plans',note:'6 sets; for fence, 3 sets only.',req:true},
            {id:'bill_of_materials',number:'6',title:'Bill of Materials',note:'',req:true},
            {id:'specifications',number:'7',title:'Specifications',note:'',req:true},
            {id:'structural_analysis',number:'8a',title:'Structural Design Analysis',note:'For 2 storeys or more.',req:false},
            {id:'geotechnical_report',number:'8b',title:'Geotechnical Investigation Report',note:'For 3 storeys and above.',req:false},
            {id:'electrical_analysis',number:'9',title:'Electrical Design Analysis',note:'',req:true}
        ]}
    ],
    procedure:[
        {id:'procedure_initial_evaluation',number:'1',title:'City Engineer’s Office for initial evaluation',note:'',req:true},
        {id:'procedure_zoning_clearance',number:'2',title:'Planning Office for Zoning Clearance',note:'',req:true},
        {id:'procedure_fire_clearance',number:'3',title:'Fire Department for Fire Clearance',note:'',req:true},
        {id:'procedure_other_clearances',number:'4',title:'Other government offices’ clearance',note:'As required / needed.',req:false},
        {id:'procedure_dpwh',number:'5',title:'DPWH clearance',note:'For structures located along secondary and national highways.',req:false},
        {id:'procedure_city_engineers_office',number:'6',title:'City Engineer’s Office',note:'',req:true}
    ]
}));
