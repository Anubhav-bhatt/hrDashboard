import React from 'react';
import { ExternalLink, Github, Globe, Linkedin, Mail, MapPin, Phone, Send } from 'lucide-react';
import { Button, Card, CopyButton, cx } from '../ui';
import { formatPhone, formatUrlLabel, safeExternalUrl, toTelHref } from '../../utils/format';

/**
 * One contact channel: the value, a copy button, and the action that uses it.
 * A channel the resume did not provide is shown as unavailable rather than
 * hidden, so recruiters know the gap exists.
 */
const ContactChannel = ({ icon: Icon, label, value, displayValue, href, actionLabel, actionIcon: ActionIcon, external }) => {
  const available = Boolean(value);

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'w-8 h-8 rounded-control flex items-center justify-center shrink-0 mt-0.5',
            available ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-300'
          )}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-label uppercase text-slate-500">{label}</p>
          {available ? (
            <p className="text-body text-slate-900 font-medium break-all mt-0.5">{displayValue || value}</p>
          ) : (
            <p className="text-meta text-slate-400 italic mt-0.5">Not provided in resume</p>
          )}
        </div>

        {available && (
          <div className="flex items-center gap-0.5 shrink-0">
            <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
            {href &&
              (external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-secondary"
                  aria-label={`${actionLabel} (opens in a new tab)`}
                >
                  {ActionIcon && <ActionIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span className="hidden sm:inline">{actionLabel}</span>
                </a>
              ) : (
                <a href={href} className="btn btn-sm btn-secondary" aria-label={actionLabel}>
                  {ActionIcon && <ActionIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span className="hidden sm:inline">{actionLabel}</span>
                </a>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * "Contact candidate" panel — the fastest path from profile to outreach.
 * Everything a recruiter needs to make contact sits here without scrolling
 * through the resume.
 */
const CandidateContactCard = ({ candidate, onCompose, onCopied }) => {
  const personal = candidate.personal || {};
  const linkedin = safeExternalUrl(personal.linkedin);
  const github = safeExternalUrl(personal.github);
  const portfolio = safeExternalUrl(personal.portfolio);
  const telHref = toTelHref(personal.phone);

  const contactBlock = [personal.name, personal.email, personal.phone ? formatPhone(personal.phone) : null, personal.currentLocation, personal.linkedin]
    .filter(Boolean)
    .join('\n');

  return (
    <Card padding="p-0" className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <h2 className="text-card-title">Contact candidate</h2>
        <CopyButton value={contactBlock} label="Copy all" copiedLabel="Copied" size="sm" onCopied={onCopied} />
      </div>

      <div className="px-5 divide-y divide-slate-100">
        <ContactChannel
          icon={Mail}
          label="Email"
          value={personal.email}
          href={personal.email ? `mailto:${personal.email}` : null}
          actionLabel="Email"
          actionIcon={Send}
        />
        <ContactChannel
          icon={Phone}
          label="Phone"
          value={personal.phone}
          displayValue={formatPhone(personal.phone, '')}
          href={telHref}
          actionLabel="Call"
          actionIcon={Phone}
        />
        {personal.alternatePhone && (
          <ContactChannel
            icon={Phone}
            label="Alternate phone"
            value={personal.alternatePhone}
            displayValue={formatPhone(personal.alternatePhone, '')}
            href={toTelHref(personal.alternatePhone)}
            actionLabel="Call"
            actionIcon={Phone}
          />
        )}
        {personal.alternateEmail && (
          <ContactChannel
            icon={Mail}
            label="Alternate email"
            value={personal.alternateEmail}
            href={`mailto:${personal.alternateEmail}`}
            actionLabel="Email"
            actionIcon={Send}
          />
        )}
        <ContactChannel icon={MapPin} label="Location" value={personal.currentLocation} />
        <ContactChannel
          icon={Linkedin}
          label="LinkedIn"
          value={personal.linkedin}
          displayValue={formatUrlLabel(personal.linkedin)}
          href={linkedin}
          actionLabel="Open"
          actionIcon={ExternalLink}
          external
        />
        <ContactChannel
          icon={Github}
          label="GitHub"
          value={personal.github}
          displayValue={formatUrlLabel(personal.github)}
          href={github}
          actionLabel="Open"
          actionIcon={ExternalLink}
          external
        />
        <ContactChannel
          icon={Globe}
          label="Portfolio"
          value={personal.portfolio}
          displayValue={formatUrlLabel(personal.portfolio)}
          href={portfolio}
          actionLabel="Open"
          actionIcon={ExternalLink}
          external
        />
      </div>

      {personal.email && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
          <Button variant="primary" size="md" icon={Send} onClick={onCompose} className="w-full">
            Draft outreach email
          </Button>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Opens a prepared draft for you to review — nothing is sent automatically.
          </p>
        </div>
      )}
    </Card>
  );
};

export default CandidateContactCard;
