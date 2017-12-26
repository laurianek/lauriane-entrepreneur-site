const shortid = require('shortid');
const Observable = require('rxjs').Observable;
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const openRequests = {};

function getAsinDetails(req, res) {
  const asins = req.query.ids && req.query.ids.split(',');
  const url = req.query.url && req.query.url.replace(/\/$/, '');
  if (!asins || !url) return res.sendStatus(400);

  const reqId = shortid.generate();
  openRequests[reqId] = {
    id: reqId,
    isCompleted: false,
    asins: {}
  };
  res.status(202).send(reqId); // respond with req id
  processAsins(reqId, asins, url);
}

function getRequestStatus(req, res) {
  const id = req.query.id;
  if (!id) return res.sendStatus(400);

  const payload = openRequests[id];
  if (!payload) return res.sendStatus(404);

  res.status(200).json(payload);
  if (payload.isCompleted) delete openRequests[id];
}

function processAsins(reqId, asins, url) {
  let $, browser;
  console.log('pumkin let`s start…');

  Observable.fromPromise(puppeteer.launch())
    .do(() => console.log('browser launched…'))
    .switchMap(_browser =>
      Observable.from(asins).mergeMap(asin => {
        browser = _browser;
        return Observable.fromPromise(browser.newPage())
          .do(() => console.log('new page launched…'))
          .switchMap(page =>
            Observable.fromPromise(page.goto(url + '/' + asin, {waitUntil: 'domcontentloaded'}))
              .switchMap(() => Observable.fromPromise(page.content()))
              .map(body => ({ body, asin, page }))
          )
      })
    )
    .map(({ body, asin, page }) => {
      console.log('hey hey got this far', asin, !!page, typeof body);
      $ = cheerio.load(body);
      const $dp = $('#dp');
      if (!$dp[0]) throw new Error('Not on product page');

      let description;
      const site = 'amazon.co.uk';
      let price;
      let category;
      let rank;

      description = $dp.find('#title #productTitle').text()
        .trim().replace(/\d+[^\s]*\s/g, '').substring(0, 50);

      const tempPrice = $dp.find('#price #priceblock_ourprice_lbl');
      const salePrice = $dp.find('#price #priceblock_saleprice_lbl');

      price = salePrice[0] ? salePrice : tempPrice;
      if (price[0]) {
        console.log(asin, price.next().text().trim().replace(/\s+/, ' '));
        price = price.next().text().trim().replace(/\s+/, ' ').split('FREE')[0];
        console.log(price, '\n',price.match(/£\d+.?\d+\b/g));
        price = price.match(/£\d+.?\d+\b/g)
          .reduce((total, price) => Number(price.substring(1)) + total, 0);
      } else price = undefined;

      $dp.find('td.label').each((i, item) => {
        if ($(item).text().toLowerCase() !== 'best sellers rank') return;
        $(item).next().text().split('(')[0].split('in')
          .forEach((text, i) => {
            if (i === 0) rank = parseInt(text.match(/\d+/g).join(''));
            if (i === 1) category = text.trim().toLowerCase();
          });
      });

      // clear memory...
      $('html').empty();
      $ = undefined;
      page.close();

      return { description, asin, site, price, category, rank };
    })
    .catch(e => {
        console.error(e);
        return {};
      })
    .subscribe(
      details => {
        // console.log(details);
        if (!details.asin) return;
        openRequests[reqId].asins[details.asin] = details;
        console.log('complete…', reqId,
          Object.keys(openRequests[reqId].asins).length, 'out of', asins.length);
      },
      () => {},
      () => {
      openRequests[reqId].isCompleted = true;
      console.log('completed', reqId, openRequests[reqId].asins);
      browser.close();
      browser = undefined;
    });
}

module.exports = {
  getAsinDetails,
  getRequestStatus
};