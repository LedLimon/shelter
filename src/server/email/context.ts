/**
 * What every letter knows besides its own data: whose it is and where its
 * links lead. Loaded when the letter is sent (loadEmailContext() in
 * ./send.ts), so a contact changed in the admin shows in the next one.
 */
export type EmailContext = {
  /** Public origin of the site, no trailing slash. */
  siteUrl: string;
  /** Dates in a letter are in this zone. */
  timeZone: string;
  shelter: {
    name: string;
    /** The organisation behind the shelter, when the requisites are filled in. */
    legalName?: string;
    /** The public address: where a reply to a letter goes. */
    email?: string;
  };
};
