import type { Metadata } from "next";
import { Contact, LEGAL, LegalHeader, Section } from "../legal";

export const metadata: Metadata = { title: "Privacy Policy", description: `How ${LEGAL.product} collects, uses and protects your information, including data from Google APIs.` };

export default function PrivacyPage() {
  const { product } = LEGAL;
  return (
    <>
      <LegalHeader
        title="Privacy Policy"
        intro={`${product} helps businesses manage their Google Business Profiles: performance, reviews, posts, competitors and profile audits. This policy explains what information we collect, how we use it, and the choices you have.`}
      />

      <Section id="summary" title="The short version">
        <ul>
          <li>We only use your data to run the features you use in {product}.</li>
          <li>We never sell your data, and we never use Google user data for advertising.</li>
          <li>We don&apos;t read your Gmail inbox. With Gmail connected we can only send the emails you ask us to send.</li>
          <li>You can disconnect Google at any time, and delete your account and data.</li>
        </ul>
      </Section>

      <Section id="collect" title="1. Information we collect">
        <p>
          <strong>Account information.</strong> When you sign up or sign in (with Google or with an email and password through Google Firebase Authentication), we receive your name, email address and
          profile photo. We never see your Google password.
        </p>
        <p>
          <strong>Google Business Profile data</strong> (only if you connect it, with the <code>business.manage</code> permission): the business accounts and locations you choose to manage, and for
          those locations their profile details (name, categories, address, hours, description, services, photos), reviews and your replies, posts, and performance insights such as views, calls and
          direction requests.
        </p>
        <p>
          <strong>Gmail</strong> (only if you connect it, with the <code>gmail.send</code> permission): the email address of the connected account. This permission lets {product} send email from your
          account; it does not let us read, search or delete your email.
        </p>
        <p>
          <strong>Google Search Console data</strong> (only if you connect it, read-only): search queries, clicks, impressions and positions for the website properties you choose.
        </p>
        <p>
          <strong>Information you enter</strong>, such as message templates, review requests (customer name, email or phone number you provide), tasks, notes, posts you draft, and competitors you add.
        </p>
        <p>
          <strong>Technical information.</strong> A sign-in cookie that keeps you signed in, plus basic server logs (IP address, browser type, time of request) used for security and troubleshooting.
          We don&apos;t use advertising or cross-site tracking cookies.
        </p>
      </Section>

      <Section id="google-data" title="2. How we use Google user data">
        <p>We access Google user data only to provide the features you turn on:</p>
        <ul>
          <li>
            <strong>Business Profile:</strong> show your profiles&apos; performance, reviews and posts; post replies and updates you write or approve; publish posts you schedule; and run the profile
            audit.
          </li>
          <li>
            <strong>Gmail:</strong> send review request emails and test emails that you create and send from {product}, from your own address.
          </li>
          <li>
            <strong>Search Console:</strong> show the searches your website appears for on the Ranking page.
          </li>
          <li>
            <strong>Sign-in:</strong> identify you and show your name and photo in the app.
          </li>
        </ul>
        <p>
          <strong>Limited Use.</strong> {product}&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul>
          <li>We use Google user data only to provide and improve the user-facing features described above.</li>
          <li>We do not transfer Google user data to others, except as needed to provide those features, to comply with the law, or as part of a merger or acquisition with notice to you.</li>
          <li>We do not use or transfer Google user data for advertising, including retargeting or personalized ads.</li>
          <li>We do not sell Google user data, and we do not use it to build user profiles or for credit or lending decisions.</li>
          <li>
            No person at {product} reads Google user data unless you ask us to (for example for support), it is needed for security (such as investigating abuse), it is required by law, or it has been
            aggregated and anonymized for internal operations.
          </li>
          <li>We do not use Google user data to develop, improve or train generalized artificial intelligence or machine-learning models.</li>
        </ul>
      </Section>

      <Section id="sharing" title="3. When we share information">
        <p>We don&apos;t sell personal information. We share it only:</p>
        <ul>
          <li>
            <strong>With service providers</strong> that run the service for us under confidentiality obligations: Google Cloud and Firebase (authentication), our hosting and database providers, and
            Google&apos;s own APIs when you act on your profiles or send email.
          </li>
          <li>
            <strong>With your team:</strong> people you invite to your workspace can see the profiles and data you give them access to.
          </li>
          <li>
            <strong>For legal reasons:</strong> when required by law, or to protect the rights, safety and security of our users and {product}.
          </li>
        </ul>
      </Section>

      <Section id="security" title="4. Storage and security">
        <ul>
          <li>Data is sent over encrypted connections (HTTPS).</li>
          <li>Google access tokens are encrypted at rest (AES-256) and used only by our servers; they are never sent to your browser.</li>
          <li>Access to production data is limited to staff who need it to operate the service.</li>
        </ul>
        <p>No system is perfectly secure. If a breach affects your data, we will notify you as required by law.</p>
      </Section>

      <Section id="retention" title="5. Keeping and deleting your data">
        <ul>
          <li>
            <strong>Disconnect Google</strong> any time in Settings. We revoke our access with Google and delete the stored tokens immediately. You can also remove access at{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              myaccount.google.com/permissions
            </a>
            .
          </li>
          <li>Google data we cached for the features (such as reviews and insights) is deleted within 30 days after you disconnect or delete your account.</li>
          <li>
            <strong>Delete your account</strong> by emailing us from the account&apos;s address. We delete your account and workspace data within 30 days, except what we must keep by law. Backups are
            overwritten within a further 30 days.
          </li>
        </ul>
      </Section>

      <Section id="rights" title="6. Your choices and rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export or delete your personal information, and to object to or restrict some processing. To make a request, contact
          us at the address below. We will not discriminate against you for using these rights.
        </p>
      </Section>

      <Section id="children" title="7. Children">
        <p>{product} is a business tool and is not meant for anyone under 16. We don&apos;t knowingly collect information from children.</p>
      </Section>

      <Section id="changes" title="8. Changes to this policy">
        <p>
          If we change this policy, we will update the date at the top. For significant changes, especially to how we use Google user data, we will tell you in the app or by email before they take
          effect.
        </p>
      </Section>

      <Section id="contact" title="9. Contact us">
        <Contact />
      </Section>
    </>
  );
}
