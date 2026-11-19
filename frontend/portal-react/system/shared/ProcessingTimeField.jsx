import React from 'react';

export default function ProcessingTimeField() {
    return <div className="form-group field-wide">
        <label htmlFor="processingTime">Processing Time</label>
        <select className="processing-time-select" id="processingTime" name="processing_time" defaultValue="" required>
            <option value="" disabled>Select processing time</option>
            <option value="simple">Simple – 3 working days</option>
            <option value="complex">Complex – 7 working days</option>
            <option value="highly_technical">Highly Technical – 20 working days</option>
        </select>
    </div>;
}
