/** Native Excel report writer. Text is always a string, never a formula or
 * hyperlink object. Calendar dates become UTC Excel date cells without shifting
 * the day. Keep this projection separate from the CSV import template.
 */
const ExcelJS=require('exceljs');
const labels={project_id:'Project ID',project_title:'Project Name',location:'Location',owner_name:'Owner / Applicant',designer_name:'Designer',permit_date:'Date Filed',date_applied:'Date Applied',bp_reference_no:'BP Reference',lot_numbers:'Lots',status:'Status'};
module.exports=async function permitWorkbook(kind,headers,rows) {
    const workbook=new ExcelJS.Workbook();
    workbook.creator='Office of the City Engineer';
    const sheet=workbook.addWorksheet(kind==='permits'?'Building Permits':'Occupancy Permits',{
        views:[{state:'frozen',ySplit:1}],
        pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}
    });
    sheet.columns=headers.map(key=>({header:labels[key]||key,key,width:key==='project_id'?16:key==='status'?20:key.includes('date')?18:key==='project_title'||key==='location'?38:28}));
    for(const values of rows) {
        const row=sheet.addRow(values.map((value,index)=>{
            if(value==null)return null;
            const text=String(value);
            if(['permit_date','date_applied'].includes(headers[index])&&/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                const date=new Date(text+'T00:00:00Z');
                if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text)return date;
            }
            return text;
        }));
        row.eachCell(cell=>{
            cell.font={name:'Calibri',size:11,color:{argb:'FF173248'}};
            cell.alignment={vertical:'top',wrapText:true};
            if(cell.value instanceof Date)cell.numFmt='mm/dd/yyyy';
            if(row.number%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F5F9'}};
        });
    }
    const header=sheet.getRow(1);header.height=28;
    header.eachCell(cell=>{
        cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:kind==='permits'?'FF173248':'FF147D64'}};
        cell.alignment={vertical:'middle',wrapText:true};
    });
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:headers.length}};
    return Buffer.from(await workbook.xlsx.writeBuffer());
};
