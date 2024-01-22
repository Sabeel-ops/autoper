const express = require('express');
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const app = express();
const port = 3000;
app.use(express.static('public'));
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content), listMajors);
});

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    fs.readFile(TOKEN_PATH, 'utf8', (err, token) => {
        if (err) {
            return getNewToken(oAuth2Client, callback);
        }
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

function listMajors(auth, res) {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.values.get({
        spreadsheetId: '18NlJR8P6it1K0z5YB-LuLUDZ5iM99DToCnf-ri_-93Y',
        range: 'Class Data!A2:E'
    }, (err, sheetsRes) => {
        if (err) {
            console.log('The API returned an error: ' + err);
            if (res) {
                res.status(500).send('Internal Server Error');
            }
            return;
        }

        const rows = sheetsRes.data.values;
        if (rows.length) {
            const data = [];
            rows.forEach((row) => {
                data.push({
                    orderno: row[0],
                    sku: row[1],
                    sku2: row[2],
                    sku3: row[3],
                    date: row[4],
                });
            });
            if (res) {
                res.json(data);
            }
        } else {
            if (res) {
                res.status(404).send('No data found.');
            }
        }
    });
}


app.get('/spreadsheet', (req, res) => {
    authorize(JSON.parse(fs.readFileSync('credentials.json')), (auth) => {
        listMajors(auth, res);
    });
});

app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
});
