// Reports contain literal text, never spreadsheet formulas. Calendar dates are
// native Excel date cells formatted MM/DD/YYYY; CSV uses the same displayed dates.
const ExcelJS=require('exceljs'),{csv}=require('./permitTransfer');
const kindLabel=kind=>kind==='permits'?'Building':'Occupancy';
const eventLabel={filed:'Filed',approved:'Finally approved',returned:'Returned for correction'};
const dateLabel=value=>value?`${value.slice(5,7)}/${value.slice(8,10)}/${value.slice(0,4)}`:'';
const headers=['Report month','Permit type','Project ID','Project title','Owner / applicant','Location','Date filed','Final approval date','Last return date','Days to approval','Filing date at approval','Archived record','Activity in reporting month'];
const rows=report=>report.allRecords.map(r=>[report.period.month,kindLabel(r.kind),r.reference,r.project_title,r.owner_name,r.location,r.filed_on,r.approved_on,r.returned_on,r.processing_days,r.approval_filed_on,r.archived?'Yes':'No',r.events.map(e=>eventLabel[e.type]+' '+dateLabel(e.date)).join('; ')]);
const dateColumns=[6,7,8,10];
function toCsv(report){return '\ufeff'+csv([headers,...rows(report).map(row=>row.map((value,index)=>dateColumns.includes(index)?dateLabel(value):value??''))]);}
function style(sheet){sheet.views=[{state:'frozen',ySplit:1}];sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};sheet.getRow(1).font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173248'}};sheet.getRow(1).height=28;sheet.eachRow((row,index)=>{row.alignment={vertical:'top',wrapText:true};if(index>1)row.font={name:'Calibri',size:11};});sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:sheet.columnCount}};}
async function excel(report){
    const workbook=new ExcelJS.Workbook();workbook.creator='Office of the City Engineer';
    const sheet=workbook.addWorksheet('Summary');sheet.columns=[{header:'Report month',width:18},{header:'Permit type / measure',width:35},{header:'Filed',width:14},{header:'Final approvals',width:18},{header:'Returned',width:14},{header:'Average calendar days',width:24},{header:'Approvals with dates',width:23}];
    for(const r of [...report.breakdown,{kind:'all',...report.summary}])sheet.addRow([report.period.month,r.kind==='all'?'Overall':kindLabel(r.kind),r.filed,r.approved,r.returned,r.average_days,r.completed_with_dates]);
    sheet.addRow([]);sheet.addRow(['Period from',new Date(report.period.from+'T00:00:00Z')]);sheet.addRow(['Period through',new Date(report.period.to+'T00:00:00Z')]);for(const row of [sheet.rowCount-1,sheet.rowCount])sheet.getCell(row,2).numFmt='mm/dd/yyyy';
    sheet.addRow(['Office time zone',report.period.timezone]);sheet.addRow(['Processing-time rule','Last final approval in month; filing date saved with that approval. Incomplete or undated approvals excluded from the average.']);sheet.addRow(['Approvals excluded from average',report.summary.missing_processing_dates]);sheet.addRow(['Returns rule','Parent permits with a recorded final return or station rejection in the reporting month. Each permit counts once.']);sheet.addRow(['Archived records included',report.coverage.archived_records]);sheet.addRow(['Legacy entries with unreadable dates',report.coverage.invalid_history_dates]);style(sheet);
    for(const kind of ['permits','occupancy']){const details=workbook.addWorksheet(kindLabel(kind));details.columns=headers.map((header,i)=>({header,width:[3,4,5,12].includes(i)?34:dateColumns.includes(i)?19:18}));
        for(const row of rows(report).filter(row=>row[1]===kindLabel(kind))){const added=details.addRow(row.map((value,index)=>dateColumns.includes(index)?value?new Date(value+'T00:00:00Z'):null:value??null));for(const index of dateColumns)added.getCell(index+1).numFmt='mm/dd/yyyy';}
        style(details);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}
module.exports={csv:toCsv,excel,headers,dateLabel};
