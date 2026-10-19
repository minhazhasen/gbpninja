// Default reply suggestions by star rating. Later: load from ReplyTemplate table and/or
// generate with an LLM using the review text and business context.
export function suggestReply(rating: number, reviewer: string, business: string): string {
  const name = reviewer.split(" ")[0];
  if (rating >= 4)
    return `Thank you so much, ${name}! We're glad you had a great experience at ${business} and look forward to seeing you again.`;
  if (rating === 3)
    return `Thanks for your feedback, ${name}. We'd love to know how we could make your next visit at ${business} a five-star one.`;
  return `Hi ${name}, we're sorry to hear about your experience. Please contact us directly so we can make this right. — The ${business} team`;
}
