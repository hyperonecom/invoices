'use strict';

const fs = require('fs');
const invoice_generator = require('./index');

if (process.argv.length < 3) {
    console.log('node example.js <invoice.json> <output.pdf>');
    process.exit(2);
}

const input_filename = process.argv[2];
const output_filename = process.argv[3];

const invoice = JSON.parse(fs.readFileSync(input_filename));
const output_stream = fs.createWriteStream(output_filename);

invoice_generator(invoice, output_stream, {
    currency: 'PLN',
    footer: {
        align: 'center',
        text: 'XYZ sp. z o.o.\n' +
            'Kapitał zakładowy: 50.000,00 zł\n' +
            'Sąd Rejonowy dla Wrocławia - Fabrycznej we Wrocławiu\n' +
            'VI Wydział Gospodarczy Krajowego Rejestru Sądowego\n' +
            'Nr KRS: 0000000000 • REGON: 000000000 • NIP: 000-00-00-000',
    },
    stripBuyerCountry: 'PL',
});
console.log(`Saved invoice from '${input_filename}' to '${output_filename}'`);
