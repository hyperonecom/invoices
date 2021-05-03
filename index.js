'use strict';

const PDFDocument = require('pdfkit');
const moment = require('moment');
const path = require('path');

const regular_font = 'OpenSans-Regular';
const bold_font = 'OpenSans-Bold';

const base_font_size = 7;
const label_font_size = 7 - 2;
const cols = [
    30, // first addressing column
    310, // second addressing column
];

const document_configuration = config => {

    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false });

    // register fonts
    doc.registerFont(regular_font, path.join(__dirname, 'fonts', `${regular_font}.ttf`));
    doc.registerFont(bold_font, path.join(__dirname, 'fonts', `${bold_font}.ttf`));

    if (config.options.info) {
        doc.info = { ...doc.info, ...config.options.info };
    }

    doc.pipe(config.output_stream);

    return doc;
};

const write_row = (doc, position, start, values) => {
    let padding = start;
    const heights = [];

    values.forEach(value => {
        const width = value.width || 60;
        const options = {
            width: width,
            align: value.align || 'center',
        };
        if (value.bold) {
            doc.font(bold_font);

        }
        doc.text(value.text, padding, position, options);
        if (value.bold) {
            doc.font(regular_font);
        }
        heights.push(doc.heightOfString(value.text, options));
        padding += width;
    });
    return position + Math.max(...heights);
};

const array_sum = arr => arr.reduce((a, b) => a + b, 0);

const horizontal_line = (doc, position, width) => {
    const start = cols[0];
    doc.strokeColor('#bbb');
    doc
        .moveTo(start, position)
        .lineTo(start + width, position)
        .stroke();
    return position;
};

const table_header = (doc, position, header) => {
    const label_english = header.map(col => ({
        text: col.label_en,
        width: col.width,
        align: col.align,
    }));
    position = write_row(doc, position, cols[0], label_english);

    doc.fontSize(base_font_size).font(bold_font);

    const label_polish = header.map(col => ({
        text: col.label,
        width: col.width,
        align: col.align,
    }));
    position = write_row(doc, position, cols[0], label_polish);

    return position;
};

const vat_description = (row, kind) => {
    if (kind == 'label' && row.vatRate == '-1') {
        return 'Wartość usług nie podlegających VAT';
    } else if (kind == 'label' && row.vatRate.toUpperCase() == 'ZW') {
        return 'Wartość usług zwolnionych z VAT';
    } else if (kind == 'label') {
        return `Wartość usług podlegających VAT ${row.vatRate}%`;
    } else if (kind == 'label_en' && row.vatRate == '-1') {
        return 'Wartość usług nie podlegających VAT';
    } else if (kind == 'label_en' && row.vatRate.toUpperCase() == 'ZW') {
        return 'Total charges exempt from VAT';
    } else if (kind == 'label_en') {
        return `Wartość usług podlegających VAT ${row.vatRate}%`;
    } else if (kind == 'value' && row.vatRate == '-1') {
        return 'NP';
    } else if (kind == 'value' && row.vatRate.toUpperCase() == 'ZW') {
        return 'ZW';
    } else if (kind == 'value') {
        return `${row.vatRate} %`;
    }
    throw new Error('Unsupported kind');
};
const vat_summary_row = (doc, position, header, row) => {
    doc.fontSize(label_font_size);
    position = write_row(doc, position, cols[0], [
        {
            text: vat_description(row, 'label_en'),
            width: array_sum(header.slice(0, 4).map(x => x.width || 60)),
            align: 'left',
        },
    ]);
    doc.fontSize(base_font_size);
    const content = [
        {
            text: vat_description(row, 'label'),
            width: array_sum(header.slice(0, 4).map(x => x.width || 60)),
            align: 'left',
            bold: true,
        },
        {
            text: row.netto.toFixed(2),
            width: header[4].width,
            align: 'right',
        },
        {
            text: vat_description(row, 'value'),
            width: header[4].width,
            align: 'center',
        },
        {
            text: row.vatAmount.toFixed(2),
            width: header[4].width,
            align: 'right',
        },
        {
            text: row.brutto.toFixed(2),
            width: header[4].width,
            align: 'right',
        },
    ];
    position = write_row(doc, position, cols[0], content);
    return position;
};

const summary_row = (doc, position, header, invoice) => {
    doc.fontSize(label_font_size);
    position = write_row(doc, position, cols[0], [
        {
            text: 'Total',
            width: 60,
            align: 'left',
        },
    ]);
    doc.fontSize(base_font_size);

    const sum_row = [
        {
            text: 'Razem',
            width: array_sum(header.slice(0, 4).map(x => x.width || 60)),
            align: 'left',
            bold: true,
        },
        {
            text: array_sum(invoice.items.map(x => parseFloat(x.netto))).toFixed(2),
            width: header[4].width,
            align: 'right',
        },
        {
            text: ' ',
            width: header[4].width,
            align: 'right',
        },
        {
            text: array_sum(invoice.items.map(x => parseFloat(x.vatAmount))).toFixed(2),
            width: header[4].width,
            align: 'right',
        },
        {
            text: array_sum(invoice.items.map(x => parseFloat(x.brutto))).toFixed(2),
            width: header[4].width,
            align: 'right',
        },
    ];
    position = write_row(doc, position, cols[0], sum_row);
    return position;
};

const summaryVAT = (invoice) => invoice.items.reduce((acc, cur) => {
    const obj = acc.find(elem => elem.vatRate === cur.vatRate);
    if (obj) {
        ['netto', 'vatAmount', 'brutto'].forEach(e => obj[e] += parseFloat(cur[e]));
    } else {
        acc.push({
            vatRate: cur.vatRate,
            netto: parseFloat(cur.netto),
            vatAmount: parseFloat(cur.vatAmount),
            brutto: parseFloat(cur.brutto),
        });
    }
    return acc;
}, []);

const table_content = (doc, position, invoice) => {
    const header = [
        {
            label: 'Lp.',
            width: 20,
            label_en: '#',
            align: 'left',
        },
        {
            label: 'Nazwa pozycji',
            label_en: 'Description',
            width: 150,
            align: 'left',
        },
        {
            label: 'Ilość',
            label_en: 'Quantity',
        },
        {
            label: 'Cena netto',
            label_en: 'Net price',
            align: 'right',
        },
        {
            label: 'Wartość netto',
            label_en: 'Net value',
            align: 'right',
        },
        {
            label: 'Stawka VAT',
            label_en: 'VAT rate',
        },
        {
            label: 'Kwota VAT',
            label_en: 'VAT amount',
            align: 'right',
        },
        {
            label: 'Wartość brutto',
            label_en: 'Gross value',
            align: 'right',
        },
    ];

    doc.fontSize(label_font_size).font(regular_font);
    position = table_header(doc, position, header);
    doc.font(regular_font);

    position = horizontal_line(doc, position, array_sum(header.map(x => x.width || 60)));
    doc.lineWidth(0.5);
    invoice.items.forEach((item, index) => {
        const data = [
            {
                value: index + 1,
            },
            {
                value: Array.isArray(item.name) ? item.name.join('\n') : item.name,
            },
            {
                value: item.quantity,
            },
            {
                value: parseFloat(item.price).toFixed(2),
                align: 'right',
            },
            {
                value: parseFloat(item.netto).toFixed(2),
                align: 'right',
            },
            {
                value: vat_description(item, 'value'),
                align: 'center',
            },
            {
                value: parseFloat(item.vatAmount).toFixed(2),
                align: 'right',
            },
            {
                value: parseFloat(item.brutto).toFixed(2),
                align: 'right',
            },
        ];
        const row = data.map((col, index) => ({
            text: col.value,
            width: header[index].width,
            align: col.align || header[index].align,
        }));
        position = write_row(doc, position, cols[0], row);
        position = horizontal_line(doc, position, array_sum(header.map(x => x.width || 60)));
    });
    // position += 5;
    summaryVAT(invoice).forEach(row => {
        position = vat_summary_row(doc, position, header, row);
        position = horizontal_line(doc, position, array_sum(header.map(x => x.width || 60)));
    });
    position = horizontal_line(doc, position, array_sum(header.map(x => x.width || 60)));
    // position += 5;
    position = summary_row(doc, position, header, invoice);

    return position;
};

const stripLeft = (text, stripped_text) => text.startsWith(stripped_text) ? text.substring(stripped_text.length) : text;

const twoLangHeader = (doc, primary, secondary, options) => {

    options.fontSizeLabel   = options.fontSizeLabel || label_font_size;
    options.fontSizePrimary = options.fontSizePrimary || base_font_size;

    doc.fontSize(options.fontSizeLabel).font(regular_font).text(secondary, options.x, options.y);
    doc.fontSize(options.fontSizePrimary).font(bold_font).text(primary, options.x, options.y + label_font_size, options);

    return options.y + label_font_size + base_font_size + 2;
};

const addressing = (doc, position, invoice, options) => {
    twoLangHeader(doc, 'Sprzedawca:', 'Seller', { x: cols[0], y: position});
    position = twoLangHeader(doc, 'Nabywca:', 'Bill to', { x: cols[1], y: position});

    doc.font(regular_font);

    // dane sprzedawcy
    const seller_lines = [
        `${invoice.seller.company}`,
        `ul. ${invoice.seller.address.street}`,
        `${invoice.seller.address.zipcode} ${invoice.seller.address.city}, ${invoice.seller.address.country}`,
        `NIP: ${invoice.seller.nip}`,
    ];
    doc.text(seller_lines.join('\n'), cols[0], position);

    // dane nabywcy
    const buyer_lines = [
        `${invoice.buyer.company}`,
        `ul. ${invoice.buyer.address.street}`,
        `${invoice.buyer.address.zipcode} ${invoice.buyer.address.city}, ${invoice.buyer.address.country}`,
        `NIP: ${stripLeft(invoice.buyer.nip, options.stripBuyerCountry || 'PL')}`,
    ];
    doc.text(buyer_lines.join('\n'), cols[1], position);
    return position + 50;
};

const header = (doc, position, invoice) => {

    const documentTypes = {
        invoice: {
            primary: 'Faktura VAT',
            label: 'VAT Invoice',
        },
        invoice_vatless: {
            primary: 'Faktura',
            label: 'Invoice',
        },
        proforma: {
            primary: 'Proforma',
            label: 'Pro forma',
        },
        invoice_duplicate: {
            primary: 'Faktura VAT - DUPLIKAT',
            label: 'VAT Invoice - DUPLICATE',
        },
    };

    const docTitle = documentTypes[invoice.documentType] || documentTypes.invoice;

    twoLangHeader(doc, docTitle.primary, docTitle.label, {
        x: cols[1],
        y: position,
        fontSizePrimary: base_font_size + 7,
        fontSizeLabel: base_font_size}
    );

    doc.fontSize(base_font_size + 7).font(bold_font).text(invoice.invoiceNo, cols[1]);
    position += 60;

    twoLangHeader(doc, 'Data wystawienia:', 'Issue date', { x: cols[1], y: position, lineBreak: false});
    doc.font(regular_font).text(moment(invoice.issueDate).format('YYYY-MM-DD'), doc.x + 5);
    position += 20;

    if (invoice.duplicateDate) {
        twoLangHeader(doc, 'Data wystawienia duplikatu:', 'Duplicate issue date', { x: cols[1], y: position, lineBreak: false});
        doc.font(regular_font).text(moment(invoice.duplicateDate).format('YYYY-MM-DD'), doc.x + 5);
        position += 20;
    }

    if (invoice.paymentDate) {
        twoLangHeader(doc, 'Data otrzymania zapłaty:', 'Date of receipt of payment', { x: cols[1], y: position, lineBreak: false});
        doc.font(regular_font).text(moment(invoice.paymentDate).format('YYYY-MM-DD'), doc.x + 5);
        position += 20;
    }

    if (invoice.dueDate) {
        twoLangHeader(doc, 'Termin płatności:', 'Due date', { x: cols[1], y: position, lineBreak: false});
        doc.font(regular_font).text(moment(invoice.dueDate).format('YYYY-MM-DD'), doc.x + 5);
        position += 20;
    }

    return position + 10;
};

function get_notes_lines(invoice) {
    const notes_lines = [];
    if (invoice.invoiceInfo) {
        notes_lines.push(invoice.invoiceInfo);
    }
    if (invoice.notes) {
        notes_lines.push(...invoice.notes);
    }
    return notes_lines;
}

const additional_information = (doc, position, invoice, options) => {
    twoLangHeader(doc, 'Waluta:', 'Currency', { x: cols[0], y: position, lineBreak: false});
    doc.font(regular_font).text(options.currency || 'PLN', doc.x + 5);

    if (invoice.seller && invoice.seller.iban) {
        position += 20;
        twoLangHeader(doc, 'Numer rachunku bankowego:', 'Bank account number', { x: cols[0], y: position, lineBreak: false});
        doc.font(regular_font).text(invoice.seller.iban.match(/..../g).join(' '), doc.x + 5);
    }

    if (invoice.paymentMethod) {
        position += 20;
        twoLangHeader(doc, 'Sposób zapłaty:', 'Payment method', { x: cols[0], y: position, lineBreak: false});
        doc.font(regular_font).text(invoice.paymentMethod || 'PLN', doc.x + 5);
    }

    position += 50;

    const notes_text = get_notes_lines(invoice);

    if (notes_text.length > 0) {

        position = twoLangHeader(doc, 'Dodatkowe informacje:', 'Additional information', {x: cols[0], y: position});

        notes_text.forEach(note => {
            doc.font(regular_font).fontSize(base_font_size).text(note, cols[0], position);
            position += doc.heightOfString(note) + 4;
        });
    }
    return position;
};

const page_footer = (doc, position, invoice, options) => {
    doc.text(options.footer.text, 0, doc.page.maxY() - doc.heightOfString(options.footer.text), {
        align: options.footer.align,
    });
    return position;
};

const add_invoice = (doc, invoice, options) => {

    doc.addPage();

    // page margins
    const margins = options.margins || { left: 30, right: 30, bottom: 44 };
    doc.page.margins = { ...doc.page.margins, ...margins };

    let position = 50;
    position = header(doc, position, invoice);
    position += 50;
    position = addressing(doc, position, invoice, options);
    position += 50;
    position = table_content(doc, position, invoice);
    position += 50;
    position = additional_information(doc, position, invoice, options);

    if (options.footer) {
        page_footer(doc, position, invoice, options);
    }
};

module.exports = (invoice, output_stream, options) => {

    const doc = document_configuration({
        invoice: invoice,
        output_stream: output_stream,
        options: options,
    });

    if (!Array.isArray(invoice)) {
        invoice = [ invoice ];
    }

    invoice.forEach(i => add_invoice(doc, i, options));

    doc.end();
};
