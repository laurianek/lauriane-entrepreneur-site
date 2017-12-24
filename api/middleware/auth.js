const jwt = require('jsonwebtoken');
const passport = require('passport');
const BearerStrategy = require('passport-http-bearer').Strategy;


passport.use('api-bearer', new BearerStrategy(function(token, done) {
  console.log('auth launched');
  if(!token) {
    console.log('* no token');
    done(null, false);
  }
  const secret = process.env.JWT_SECRET;
  const options = {
    algorithms: ["HS256"]
  };

  jwt.verify(token, secret, options, function(err, payload) {
    if (err) {
      console.log('* token failed', err);
      return done(null, false, err);
    }
    console.log('* token success');
    done(null, payload);
  });
}));

const Auth = function (req, res, next) {
  function callback(err, user, info) {
    if (err) {
      console.log('* new error in auth:', err);
      return next(err);
    }
    if(!user && info && info.message) {
      console.log('* bearer auth failed, exiting');
      console.log(err.message);
      return res.sendStatus(401);
    }
    console.log('* bearer auth success!');
    // req.user = user;
    next();
  }

  // main
  try {
    passport.authenticate('api-bearer', callback)(req, res, next);
  } catch(e) {
    console.log('* some error occurred', e); next(e);
  }
};

module.exports = Auth;