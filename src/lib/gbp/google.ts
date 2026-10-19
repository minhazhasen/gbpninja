import type { GbpProvider } from "./types";

// Real Google Business Profile provider.
//
// Google APIs involved (all require the `https://www.googleapis.com/auth/business.manage` scope
// and an approved GBP API access request for your Cloud project):
//   - Account Management:   https://mybusinessaccountmanagement.googleapis.com/v1/accounts
//   - Business Information: https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
//   - Performance:          https://businessprofileperformance.googleapis.com/v1/{location}:fetchMultiDailyMetricsTimeSeries
//   - Reviews (v4):         https://mybusiness.googleapis.com/v4/{account}/{location}/reviews
//   - Local posts (v4):     https://mybusiness.googleapis.com/v4/{account}/{location}/localPosts
//
// TODO: implement each method. Posts are not natively schedulable in the API — "scheduled" posts
// are stored in our DB (see prisma/schema.prisma) and published by a cron job at scheduledFor.

const notImplemented = (method: string) => () => {
  throw new Error(`googleProvider.${method} is not implemented yet. Set GBP_DATA_SOURCE=mock to use demo data.`);
};

export function createGoogleProvider(accessToken: string): GbpProvider {
  void accessToken;
  return {
    listLocations: notImplemented("listLocations"),
    getLocation: notImplemented("getLocation"),
    updateLocation: notImplemented("updateLocation"),
    listReviews: notImplemented("listReviews"),
    replyToReview: notImplemented("replyToReview"),
    getMetrics: notImplemented("getMetrics"),
    listPosts: notImplemented("listPosts"),
    createPost: notImplemented("createPost"),
  };
}
