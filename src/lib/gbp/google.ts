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
// are stored in our DB (see prisma/schema.prisma) and published by a cron job at scheduled_at.
// Facebook / Instagram / LinkedIn need their own OAuth connections (Meta Graph API, LinkedIn API).

const notImplemented = (method: string) => () => {
  throw new Error(`googleProvider.${method} is not implemented yet. Set GBP_DATA_SOURCE=mock to use demo data.`);
};

export function createGoogleProvider(accessToken: string): GbpProvider {
  void accessToken;
  return {
    listLocations: notImplemented("listLocations"),
    getLocation: notImplemented("getLocation"),
    updateLocation: notImplemented("updateLocation"),
    // Media (v4): POST {account}/{location}/media with { mediaFormat: "PHOTO", locationAssociation: { category }, sourceUrl }
    // (or startUpload + dataRef for bytes); PATCH .../media/{id}?updateMask=locationAssociation; DELETE .../media/{id}.
    addPhotos: notImplemented("addPhotos"),
    updatePhoto: notImplemented("updatePhoto"),
    deletePhoto: notImplemented("deletePhoto"),
    // Categories: mybusinessbusinessinformation categories.list / batchGet; services: location.serviceItems.
    // Website services need a crawl of websiteUri; market services need nearby competitors (Places API).
    getProfileSuggestions: notImplemented("getProfileSuggestions"),
    // GET mybusinessbusinessinformation/v1/categories?regionCode=US&languageCode=en&view=BASIC&filter=displayName={query}&pageSize={limit}
    searchCategories: notImplemented("searchCategories"),
    // Competitors: Places API (New) Text Search near the profile, e.g.
    //   POST https://places.googleapis.com/v1/places:searchText  { textQuery: primaryCategory, locationBias: { circle: { center, radius: 5000 } } }
    //   X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.types,
    //                     places.rating,places.userRatingCount,places.websiteUri
    // Places types are close to (not the same as) GBP categories: map primaryTypeDisplayName → primary, other types → additional.
    // Distance = haversine from the profile's latlng. Needs a Places API key (server-side) — not the user's OAuth token.
    // Added / removed competitors are ours (store per location in our DB: placeId + hidden flag), merged with the Places results above.
    listCompetitors: notImplemented("listCompetitors"),
    // Add / edit: from a Google Maps link (src/lib/maps-link.ts) + typed details, stored per location in our DB (no Places key needed).
    addCompetitor: notImplemented("addCompetitor"),
    updateCompetitor: notImplemented("updateCompetitor"),
    deleteCompetitor: notImplemented("deleteCompetitor"),
    recordCompetitorCheck: notImplemented("recordCompetitorCheck"),
    setCompetitorHidden: notImplemented("setCompetitorHidden"),
    listReviews: notImplemented("listReviews"),
    updateReview: notImplemented("updateReview"),
    // Workspace users live in our own DB (Prisma), not in Google.
    listTeamMembers: notImplemented("listTeamMembers"),
    listMembers: notImplemented("listMembers"),
    getCurrentMember: notImplemented("getCurrentMember"),
    inviteMember: notImplemented("inviteMember"),
    updateMember: notImplemented("updateMember"),
    // Passwords are ours, not Google's: Auth.js Credentials provider + a hashed password column (argon2/scrypt) and a
    // reset-token table; the reset email needs an email service.
    changePassword: notImplemented("changePassword"),
    sendPasswordReset: notImplemented("sendPasswordReset"),
    removeMember: notImplemented("removeMember"),
    resendInvite: notImplemented("resendInvite"),
    acceptInvite: notImplemented("acceptInvite"),
    findInvite: notImplemented("findInvite"),
    listReviewRequests: notImplemented("listReviewRequests"),
    createReviewRequest: notImplemented("createReviewRequest"),
    updateReviewRequest: notImplemented("updateReviewRequest"),
    getMetrics: notImplemented("getMetrics"),
    // businessprofileperformance.googleapis.com/v1/{location}/searchkeywords/impressions/monthly
    getSearchKeywords: notImplemented("getSearchKeywords"),
    getConnectedChannels: async () => ["google"],
    // Connections need our own DB rows + an OAuth app per network (Meta Graph API, LinkedIn, X API v2).
    listConnections: notImplemented("listConnections"),
    connectChannel: notImplemented("connectChannel"),
    listConnectionOptions: notImplemented("listConnectionOptions"),
    selectConnectionTargets: notImplemented("selectConnectionTargets"),
    disconnectChannel: notImplemented("disconnectChannel"),
    syncConnections: notImplemented("syncConnections"),
    // Google Search Console (the Ranking page). Needs the Google sign-in to also request
    // https://www.googleapis.com/auth/webmasters.readonly (incremental auth) and the Search Console API enabled.
    //   Properties: GET https://www.googleapis.com/webmasters/v3/sites  → siteEntry[{ siteUrl, permissionLevel }]
    //   Report:     POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
    //               { startDate, endDate, dimensions: ["query"] } and ["date"] → rows[{ keys, clicks, impressions, ctr, position }]
    //   Query detail: same endpoint with dimensionFilterGroups [{ filters: [{ dimension: "query", operator: "equals", expression }] }]
    //               and dimensions ["date"], ["page"], ["device"] (three calls).
    // The location → property mapping lives in our DB.
    getSearchConsole: notImplemented("getSearchConsole"),
    connectSearchConsole: notImplemented("connectSearchConsole"),
    listSearchConsoleProperties: notImplemented("listSearchConsoleProperties"),
    setSearchConsoleSites: notImplemented("setSearchConsoleSites"),
    disconnectSearchConsole: notImplemented("disconnectSearchConsole"),
    getSearchConsoleReport: notImplemented("getSearchConsoleReport"),
    getSearchConsoleQuery: notImplemented("getSearchConsoleQuery"),
    // Gmail: same Google sign-in with the https://www.googleapis.com/auth/gmail.send scope (incremental auth).
    //   Send: POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send { raw: base64url(RFC 2822 message) }
    //   Address: GET https://gmail.googleapis.com/gmail/v1/users/me/profile → emailAddress. Sender settings + templates live in our DB.
    getEmailSender: notImplemented("getEmailSender"),
    connectGmail: notImplemented("connectGmail"),
    updateEmailSender: notImplemented("updateEmailSender"),
    disconnectGmail: notImplemented("disconnectGmail"),
    sendEmail: notImplemented("sendEmail"),
    listTemplates: notImplemented("listTemplates"),
    saveTemplate: notImplemented("saveTemplate"),
    deleteTemplate: notImplemented("deleteTemplate"),
    // Tasks are ours (not a Google API): move them to Prisma (Task table, parentId for subtasks) with the review follow-up sync.
    listTasks: notImplemented("listTasks"),
    createTask: notImplemented("createTask"),
    updateTask: notImplemented("updateTask"),
    deleteTask: notImplemented("deleteTask"),
    listPosts: notImplemented("listPosts"),
    savePost: notImplemented("savePost"),
    reschedulePost: notImplemented("reschedulePost"),
    publishPost: notImplemented("publishPost"),
    deletePost: notImplemented("deletePost"),
  };
}
