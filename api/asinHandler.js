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

function getPrice($el) {
  const inter = $el.text().trim().replace(/\s+/g, ' ').split('FREE')[0]
    .match(/£\d+.?\d+\b/g);
  if (!inter || inter.length === 0) return undefined;
  return inter.reduce((total, price) => Number(price.substring(1)) + total, 0);
}

function processAsins(reqId, asins, url) {
  let $;
  Observable.from(asins)
    .mergeMap(asin =>
      Observable.fromPromise(rp({
        url: url + '/' + asin,
        transform: body => cheerio.load(body)
      })).map($ => ({ $, asin })))
    .map(({ $, asin }) => {
      const $dp = $('#dp');
      if (!$dp[0]) throw new Error('Not on product page');

      let description;
      const site = 'amazon.co.uk';
      let price;
      let category;
      let rank;

      description = $dp.find('#title #productTitle').text()
        .trim().replace(/\d+[^\s]*\s/g, '').substring(0, 50);

      const $tempPrice = $dp.find('#price #priceblock_ourprice_lbl');
      const $salePrice = $dp.find('#price #priceblock_saleprice_lbl');
      const $dealPrice = $dp.find('#price #priceblock_dealprice_lbl');
      let buyBoxPrice = $dp.find('#buybox #soldByThirdParty')[0];

      if ($dealPrice[0]) price = $dealPrice;
      else if ($salePrice[0]) price = $salePrice;
      else price = $tempPrice;

      if (price[0]) price = getPrice(price.next());
      else price = undefined;

      if (buyBoxPrice) {
        buyBoxPrice = getPrice($(buyBoxPrice));
        price = buyBoxPrice && (buyBoxPrice > price) ? buyBoxPrice : price;
      }

      $dp.find('td.label').each((i, item) => {
        if ($(item).text().toLowerCase() !== 'best sellers rank') return;
        $(item).next().text().split('(')[0].split(' in ')
          .forEach((text, i) => {
            if (i === 0) rank = parseInt(text.match(/\d+/g).join(''));
            if (i === 1) category = text.trim().toLowerCase();
          });
      });
      (() => {
        let $dpOddDetails;
        if (!rank || !category) {
          $('.bucket').each((i, item) => {
            if ($(item).find('h2').text().toLowerCase() === 'product details') $dpOddDetails = $(item);
          });
        }
        if (!$dpOddDetails) return;
        $dpOddDetails.find('li').each((i, li) => {
          const d = $(li).text().trim().split(':').map(a => a.trim());
          if (d[0].toLowerCase() === 'amazon bestsellers rank') {
            d[1].split('(')[0].split(' in ').forEach((text, i) => {
              if (i === 0) rank = parseInt(text.match(/\d+/g).join(''));
              if (i === 1) category = text.trim().toLowerCase();
            });
          }
        });
      })();

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