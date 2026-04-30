const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');

const app = express();

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRINTFUL_API_KEY      = process.env.PRINTFUL_API_KEY;
const FRONTEND_URL          = process.env.FRONTEND_URL;
const PORT                  = process.env.PORT || 3000;

const PRINTFUL_BASE_URL = 'https://api.printful.com';

const PRODUCT_MAP = {
  'plink_1TG3P5KOBecpGmaFTV2GgNXO': {
    title:      'Your Crown',
    templateId: '102044794',
    fileType:   'default',
    imageUrl:   () => `${FRONTEND_URL}/images/Your-Crown-Sticker-Sheet.png`,
  },
  'plink_1TG3TSKOBecpGmaFlJdbUarh': {
    title:      'Loved & Chosen',
    templateId: '102044621',
    fileType:   'default',
    imageUrl:   () => `${FRONTEND_URL}/images/Loved-&-Chosen-Sticker-Sheet.png`,
  },
  'plink_1TG3RuKOBecpGmaFls0Z9TiA': {
    title:      'Affirmations',
    templateId: '102044431',
    fileType:   'default',
    imageUrl:   () => `${FRONTEND_URL}/images/affirmations-sheet.png`,
  },
  'plink_1TG3QyKOBecpGmaFLI2AgUZt': {
    title:      'Full Joy Bundle',
    templateId: null,
    fileType:   'default',
    imageUrl:   null,
  },
  'plink_1TRySKKOBecpGmaFUqF6ix8J': {
    title:      'Sticky Joys Journal',
    templateId: '101884904',
    fileType:   'front',
    imageUrl:   () => `${FRONTEND_URL}/images/journal-cover.jpg`,
  },
};

const BUNDLE_PLINKS = [
  'plink_1TG3P5KOBecpGmaFTV2GgNXO',
  'plink_1TG3TSKOBecpGmaFlJdbUarh',
  'plink_1TG3RuKOBecpGmaFls0Z9TiA',
];

const printfulHeaders = {
  'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
