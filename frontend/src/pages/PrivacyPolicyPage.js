import React from "react";
import { Link } from "react-router-dom";

const Section = ({ title, children }) => (
  <div className="space-y-2">
    <h2 className="text-base font-semibold text-gray-200">{title}</h2>
    <div className="text-sm text-gray-400 space-y-2">{children}</div>
  </div>
);

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">SmartBudget — Privacy Policy</h1>
          <p className="text-xs text-gray-500 mt-1">Last updated: March 2026</p>
        </div>

        <Section title="1. Who we are">
          <p>
            SmartBudget is a personal finance tracking application. This policy explains what data
            we collect, how we use it, and your rights under the General Data Protection Regulation
            (GDPR).
          </p>
        </Section>

        <Section title="2. Data we collect">
          <p>When you create an account we collect:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your <strong className="text-gray-300">email address</strong> — for authentication and account recovery.</li>
            <li>A <strong className="text-gray-300">bcrypt-hashed password</strong> — your plain-text password is never stored.</li>
            <li><strong className="text-gray-300">Financial transactions</strong> you import or enter manually — dates, descriptions, and amounts.</li>
            <li>Any <strong className="text-gray-300">categories, mapping rules, and investment data</strong> you create.</li>
          </ul>
          <p>We do not collect your name, phone number, location, or any payment information.</p>
        </Section>

        <Section title="3. How we use your data">
          <p>Your data is used solely to provide the SmartBudget service:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Authenticating you and securing your account.</li>
            <li>Displaying and analysing your financial transactions.</li>
            <li>Sending account-related emails (verification links, password-reset links).</li>
          </ul>
          <p>We do <strong className="text-gray-300">not</strong> sell, share, or transfer your data to any third party for marketing or analytics purposes.</p>
        </Section>

        <Section title="4. Data storage and security">
          <ul className="list-disc pl-5 space-y-1">
            <li>All data is stored in a PostgreSQL database hosted on a private server.</li>
            <li>Passwords are hashed with bcrypt and are never recoverable.</li>
            <li>All connections are protected by HTTPS/TLS.</li>
            <li>Authentication uses short-lived JWT tokens (8-hour expiry).</li>
          </ul>
        </Section>

        <Section title="5. Your rights (GDPR)">
          <p>As a data subject under GDPR you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-gray-300">Access</strong> — request a copy of your data via Settings → Export.</li>
            <li><strong className="text-gray-300">Erasure</strong> — permanently delete your account and all associated data via Settings → Delete my account.</li>
            <li><strong className="text-gray-300">Rectification</strong> — edit or correct any transaction or account data directly in the app.</li>
            <li><strong className="text-gray-300">Portability</strong> — download all your data as a JSON file at any time via Settings → Export.</li>
          </ul>
        </Section>

        <Section title="6. Data retention">
          <p>
            Your data is retained for as long as your account is active. When you delete your account
            all data is immediately and permanently removed from the database.
          </p>
        </Section>

        <Section title="7. Cookies and tracking">
          <p>
            SmartBudget does not use cookies for tracking or analytics. A single session token
            is stored in your browser's local storage to keep you signed in.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            For any privacy-related questions or data requests, please contact the administrator
            directly via the app's support channel.
          </p>
        </Section>

        <div className="pt-4 border-t border-gray-800">
          <Link to="/login" className="text-indigo-400 hover:underline text-sm">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
