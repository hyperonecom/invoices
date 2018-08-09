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

const vat_summary_row = (doc, position, header, row) => {
    doc.fontSize(label_font_size);
    position = write_row(doc, position, cols[0], [
        {
            text: row.vatRate === '-1' ? 'Total charges with no VAT' : `Total charges with ${row.vatRate}% VAT`,
            width: array_sum(header.slice(0, 4).map(x => x.width || 60)),
            align: 'left',
        },
    ]);
    doc.fontSize(base_font_size);
    const content = [
        {
            text: row.vatRate === '-1' ? 'Wartość usług nie podlegających VAT' : `Wartość usług podlegających VAT ${row.vatRate}%`,
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
            text: row.vatRate === '-1' ? 'np' : `${row.vatRate} %`,
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
            label_en: 'VAT Amount',
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
                value: item.vatRate !== '-1' ? `${item.vatRate} %` : 'np',
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

const addressing = (doc, position, invoice, options) => {
    doc.font(regular_font);
    doc.fontSize(label_font_size).text('Bill to', cols[1], position);
    doc.text('Seller', cols[0], position);

    position += label_font_size;

    doc.fontSize(base_font_size).font(bold_font).text('Nabywca:', cols[1], position);
    doc.text('Sprzedawca: ', cols[0], position).font(regular_font);

    position += base_font_size + 2;
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
    // VAT Invoice
    doc.fontSize(base_font_size).text('VAT Invoice', cols[1]);
    // Faktura VAT
    doc.fontSize(base_font_size + 7).font(bold_font).text(`Faktura VAT\n${invoice.invoiceNo}`, cols[1]);

    position += 80;
    doc.fontSize(label_font_size).font(regular_font).text('Issue date', cols[1], position);
    position += label_font_size;
    doc.fontSize(base_font_size).font(bold_font).text('Data wystawienia:', cols[1], position, {lineBreak : false});
    doc.font(regular_font).text(moment(invoice.issueDate).format('YYYY-MM-DD'), doc.x + 5);
    return position + 20;
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
    doc.fontSize(label_font_size).text('Currency', cols[0], position);
    doc.fontSize(base_font_size).font(bold_font).text(`Waluta: ${options.currency || 'PLN'}`).font(regular_font);
    position += 50;

    const notes_text = get_notes_lines(invoice);

    if (notes_text.length > 0) {
        doc.fontSize(label_font_size).text('Additional information', cols[0], position);
        position += 5;
        doc.fontSize(base_font_size).font(bold_font).text('Dodatkowe informacje:', cols[0], position).font(regular_font);
        position += base_font_size + 4;
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
    doc.page.margins = Object.assign({}, doc.page.margins, margins);

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
    };
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
