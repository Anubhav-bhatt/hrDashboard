import React from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '../ui';

/**
 * The one visible "this is AI" marker on a page.
 *
 * Restrained on purpose. The product's design language is quiet — subdued badges,
 * a single brand accent, no gradients — and an AI section that announced itself
 * with glowing borders would read as a bolted-on demo rather than part of the
 * application. One badge per page is enough to set the expectation that output is
 * assistive; repeating it on every card would be noise.
 *
 * Uses the existing `badge-brand` styling, so it inherits dark mode and any
 * future palette change for free.
 */
const AiBadge = ({ label = 'AI', className }) => (
  <Badge variant="brand" icon={Sparkles} className={className}>
    {label}
  </Badge>
);

export default AiBadge;
