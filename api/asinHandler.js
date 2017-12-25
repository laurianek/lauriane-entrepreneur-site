const shortid = require('shortid');
const Observable = require('rxjs').Observable;
const rp = require('request-promise');
const cheerio = require('cheerio');

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
  console.log(url);
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
  let $;
  Observable.from(asins)
    .mergeMap(asin =>
      Observable.fromPromise(rp(url + '/' + asin))
        .map(body => ({ body, asin })))
    .map(({ body, asin }) => {
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
        price = price.next().text()
          .trim().replace(/\s+/, ' ').match(/£\d+.?\d+\b/g)
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

      return { description, asin, site, price, category, rank };
    })
    .catch(e => {
      console.error(e);
      return {};
    })
    .subscribe(
      details => {
        if (!details.asin) return;
        openRequests[reqId].asins[details.asin] = details;
        console.log('complete…', reqId,
          Object.keys(openRequests[reqId].asins).length, 'out of', asins.length);
      },
      function onError() {},
      () => {
      openRequests[reqId].isCompleted = true;
      console.log('completed', reqId);
    })
}

module.exports = {
  getAsinDetails,
  getRequestStatus
};