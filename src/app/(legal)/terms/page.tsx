import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LEGAL, LegalHeader, Section } from "../legal";

export const metadata: Metadata = { title: "Terms of Service", description: `The terms for using ${LEGAL.product}.` };

export default function TermsPage() {
  const { product } = LEGAL;
  return (
    <>
      <LegalHeader title="Terms of Service" intro={`These terms are an agreement between you and ${product}. By creating an account or using ${product}, you agree to them.`} />

      <Section id="service" title="1. The service">
        <p>
          {product} is a web app for managing Google Business Profiles: performance insights, reviews and replies, scheduled posts, competitor tracking, profile audits, review requests and team tasks.
          The app is free to use. We may add, change or remove features over time.
        </p>
      </Section>

      <Section id="accounts" title="2. Your account">
        <ul>
          <li>You must be at least 16 and able to form a binding contract.</li>
          <li>Keep your sign-in details secure. You are responsible for activity in your account and workspace, including by people you invite.</li>
          <li>Give accurate information, and tell us if you think your account has been used without permission.</li>
        </ul>
      </Section>

      <Section id="google" title="3. Connecting Google and other services">
        <ul>
          <li>
            You may connect only Business Profiles, Gmail accounts and Search Console properties that you own or are authorized to manage. When you connect them, you let {product} act on them for the
            features you use.
          </li>
          <li>
            Your use of Google services is also governed by Google&apos;s terms and policies, including the{" "}
            <a href="https://support.google.com/business/answer/3038177" target="_blank" rel="noreferrer">
              Google Business Profile guidelines
            </a>
            . Changes, suspensions or API limits made by Google are outside our control.
          </li>
          <li>
            How we handle Google user data is described in our <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>
      </Section>

      <Section id="use" title="4. Acceptable use">
        <p>You agree not to use {product} to:</p>
        <ul>
          <li>post fake, misleading or incentivized reviews, or select which customers are asked for reviews based on their expected rating (review gating);</li>
          <li>send spam, or email or text people who have not agreed to hear from you; follow anti-spam laws such as CAN-SPAM and GDPR;</li>
          <li>break any law, or infringe anyone&apos;s rights, including intellectual property and privacy rights;</li>
          <li>misrepresent a business, or manage profiles you are not authorized to manage;</li>
          <li>interfere with the service, probe it for vulnerabilities without permission, or access it by automated means except through features we provide.</li>
        </ul>
      </Section>

      <Section id="content" title="5. Your content">
        <p>
          You keep ownership of what you add to {product} (posts, replies, templates, photos and other content). You give us permission to store, process and publish it only as needed to run the
          features you use, for example to publish a post to your Business Profile. You are responsible for your content and for having the rights to use it.
        </p>
        <p>Emails and posts sent through {product} are sent on your behalf and in your name. You are responsible for their content and for having permission to contact the recipients.</p>
      </Section>

      <Section id="services" title="6. Optional paid services">
        <p>
          {product} may show offers for separate services, such as managed local SEO. Booking a call is optional and free. Any paid service is covered by a separate agreement that we will share with
          you before you buy.
        </p>
      </Section>

      <Section id="ip" title="7. Our property">
        <p>
          {product}, including its software, design and brand, belongs to us and our licensors. These terms don&apos;t give you any right to use our name or logos. If you send us feedback, we may use
          it without any obligation to you.
        </p>
      </Section>

      <Section id="disclaimer" title="8. Disclaimers">
        <p>
          {product} is provided “as is” and “as available”. To the extent the law allows, we disclaim all warranties, including fitness for a particular purpose and non-infringement. We don&apos;t
          promise that the service will be uninterrupted or error-free, or that it will improve your search ranking, calls or revenue. Data from Google and other services may be delayed or inaccurate.
        </p>
      </Section>

      <Section id="liability" title="9. Limitation of liability">
        <p>
          To the extent the law allows, {product} is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or goodwill. Our total
          liability for any claim relating to the service is limited to the greater of the amount you paid us in the 12 months before the claim or USD 100. Nothing in these terms limits liability that
          cannot be limited by law.
        </p>
      </Section>

      <Section id="termination" title="10. Ending your use">
        <p>
          You can stop using {product} and delete your account at any time. We may suspend or close accounts that break these terms or put the service or other users at risk; where reasonable, we will
          tell you first. When an account is closed, we delete its data as described in the <Link href="/privacy#retention">Privacy Policy</Link>.
        </p>
      </Section>

      <Section id="changes" title="11. Changes to these terms">
        <p>
          We may update these terms. We will change the date at the top and, for significant changes, tell you in the app or by email before they take effect. If you keep using {product} after that,
          you accept the updated terms.
        </p>
      </Section>

      <Section id="contact" title="12. Contact us">
        <Contact />
      </Section>
    </>
  );
}
