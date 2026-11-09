type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string };

type Section = {
  id: string;
  title: string;
  blocks: Block[];
};

const SECTIONS: Section[] = [
  {
    id: "introduction",
    title: "1. Introduction and acceptance",
    blocks: [
      { type: "p", text: "Welcome to TIJAR." },
      {
        type: "p",
        text: "TIJAR is a digital business platform that enables merchants, entrepreneurs, service providers and customers to discover businesses, display products and services, communicate, manage business activities and, where supported, conduct transactions through integrated payment services.",
      },
      {
        type: "p",
        text: "These Terms of Service (“Terms”) govern access to and use of TIJAR’s website, mobile applications, services and marketplace features.",
      },
      {
        type: "p",
        text: "By registering, accessing, browsing or using TIJAR, you agree to comply with these Terms, our Privacy Policy, Refund Policy and any additional policies applicable to specific services.",
      },
      {
        type: "p",
        text: "If you do not agree with these Terms, you should discontinue using the relevant services.",
      },
    ],
  },
  {
    id: "intermediary",
    title: "2. TIJAR’s role as a digital intermediary",
    blocks: [
      {
        type: "p",
        text: "Unless expressly stated otherwise in a separate written agreement, TIJAR operates as a technology and marketplace intermediary connecting independent buyers and sellers.",
      },
      { type: "p", text: "TIJAR is not automatically:" },
      {
        type: "ul",
        items: [
          "The manufacturer, owner, supplier or seller of products listed by independent merchants.",
          "The purchaser or recipient of products sold by merchants.",
          "The delivery company or logistics provider responsible for fulfilling orders.",
          "The guarantor of the quality, authenticity, safety, legality or suitability of third-party products.",
          "The employer, agent, legal representative or business partner of marketplace merchants.",
          "A bank, deposit-taking institution or independent custodian of customer funds.",
        ],
      },
      {
        type: "p",
        text: "A purchase between a customer and an independent merchant is ordinarily a transaction between those parties.",
      },
      {
        type: "p",
        text: "The merchant remains responsible for the products or services it offers, the accuracy of its listings, its representations to customers, order fulfilment, applicable warranties and its obligations under Nigerian law.",
      },
      {
        type: "p",
        text: "Nothing in this section excludes responsibilities that TIJAR itself has under applicable law or under a specific service agreement.",
      },
    ],
  },
  {
    id: "merchant",
    title: "3. Merchant responsibilities",
    blocks: [
      { type: "p", text: "Every merchant using TIJAR agrees to:" },
      {
        type: "ol",
        items: [
          "Provide accurate and truthful business and contact information.",
          "Publish accurate product descriptions, prices, availability and photographs.",
          "Disclose relevant product conditions, including whether an item is new, used, refurbished or defective.",
          "Honour accepted orders and agreed prices.",
          "Communicate honestly with customers.",
          "Fulfil orders within the agreed delivery or collection period.",
          "Handle returns, replacements, warranties and refunds in accordance with applicable law and the merchant’s disclosed terms.",
          "Avoid counterfeit, prohibited, stolen, unsafe or unlawful products and services.",
          "Cooperate reasonably with TIJAR during legitimate investigations.",
          "Maintain records and evidence of orders, payments, delivery and customer communication.",
        ],
      },
      {
        type: "p",
        text: "Merchants must not misrepresent their identity, impersonate another business, manipulate reviews, engage in fraud or use TIJAR to facilitate unlawful transactions.",
      },
      {
        type: "p",
        text: "TIJAR may restrict, suspend or remove a merchant account or listing where there is credible evidence of fraud, prohibited activity, consumer harm or a material breach of these Terms.",
      },
    ],
  },
  {
    id: "customer",
    title: "4. Customer responsibilities",
    blocks: [
      { type: "p", text: "Customers agree to:" },
      {
        type: "ol",
        items: [
          "Review product descriptions, prices, seller information and applicable conditions before ordering.",
          "Confirm important product details with the merchant where necessary.",
          "Provide accurate order and delivery information.",
          "Make payments through the payment methods and procedures presented on TIJAR where using TIJAR’s transaction services.",
          "Retain transaction references, receipts and relevant communications.",
          "Report suspected fraud, unauthorised transactions or material order problems promptly.",
          "Avoid false, abusive, fraudulent or deliberately misleading complaints.",
        ],
      },
      {
        type: "p",
        text: "Customers should verify that the product or service meets their requirements before completing an order, without prejudice to any consumer rights provided by applicable law.",
      },
    ],
  },
  {
    id: "on-platform",
    title: "5. On-platform transaction requirement",
    blocks: [
      { type: "h3", text: "5.1 Eligibility for TIJAR marketplace intervention" },
      {
        type: "p",
        text: "TIJAR’s internal marketplace dispute-resolution and transaction-support process applies to transactions that are initiated, recorded and completed through TIJAR’s recognised on-platform transaction process.",
      },
      {
        type: "p",
        text: "To qualify for TIJAR’s voluntary transaction investigation and mediation service, the customer must provide sufficient evidence that the relevant transaction was processed through TIJAR.",
      },
      { type: "p", text: "This ordinarily includes:" },
      {
        type: "ul",
        items: [
          "A valid TIJAR order or transaction reference.",
          "The relevant merchant and customer account details.",
          "Payment confirmation generated or recognised by the platform or its authorised payment provider.",
          "Order details and evidence of the agreed product or service.",
          "Relevant communications and delivery or collection evidence.",
        ],
      },
      { type: "h3", text: "5.2 Off-platform transactions" },
      {
        type: "p",
        text: "Where a customer discovers a merchant on TIJAR but independently transfers money to the merchant’s personal bank account, pays in cash, uses an external payment link, or otherwise completes the transaction outside TIJAR’s recognised transaction process, TIJAR may be unable to verify, trace or investigate that transaction through its payment and order records.",
      },
      { type: "p", text: "Accordingly:" },
      {
        type: "ul",
        items: [
          "Such transactions are not eligible for TIJAR’s voluntary on-platform transaction mediation, payment verification or platform-administered refund process.",
          "TIJAR will not be responsible for independently verifying payments made outside its recognised payment process.",
          "TIJAR does not guarantee recovery of money paid directly to a merchant outside the platform.",
          "Customers are encouraged to use TIJAR’s recognised transaction process for eligible purchases.",
        ],
      },
      {
        type: "note",
        text: "Important: This limitation applies to TIJAR’s voluntary platform transaction-support services. It does not prevent a customer from reporting suspected fraud, unlawful conduct, a platform-related issue or exercising any statutory right or remedy available under Nigerian law.",
      },
    ],
  },
  {
    id: "disputes",
    title: "6. Dispute resolution policy",
    blocks: [
      { type: "h3", text: "6.1 What qualifies as a marketplace dispute?" },
      { type: "p", text: "A dispute may arise where:" },
      {
        type: "ul",
        items: [
          "A customer pays but the merchant does not deliver the order.",
          "The product received is materially different from its description.",
          "The product is damaged, defective or incomplete.",
          "A merchant refuses to honour an accepted order.",
          "A payment is recorded more than once.",
          "A transaction is suspected to be fraudulent or unauthorised.",
          "A merchant or customer alleges a material breach of the agreed transaction terms.",
        ],
      },
      { type: "h3", text: "6.2 First-level resolution: buyer and merchant" },
      {
        type: "p",
        text: "Customers should first contact the merchant through the available TIJAR communication channels and attempt to resolve the issue directly.",
      },
      {
        type: "p",
        text: "The merchant should respond within a reasonable period and make a genuine effort to resolve the complaint.",
      },
      {
        type: "p",
        text: "This first step does not remove any right a customer may have to approach a regulator or other competent authority.",
      },
      { type: "h3", text: "6.3 Second-level resolution: TIJAR Support" },
      {
        type: "p",
        text: "If the parties cannot resolve an eligible on-platform dispute, the customer may submit a complaint to TIJAR Support.",
      },
      { type: "p", text: "The complaint should include:" },
      {
        type: "ul",
        items: [
          "Full name and registered contact details.",
          "TIJAR order or transaction reference.",
          "Merchant details.",
          "Date and amount of transaction.",
          "Description of the complaint.",
          "Supporting evidence, such as receipts, photographs, messages or delivery records.",
        ],
      },
      { type: "p", text: "TIJAR may request further information from either party." },
      { type: "h3", text: "6.4 TIJAR’s investigation and mediation role" },
      { type: "p", text: "TIJAR may:" },
      {
        type: "ul",
        items: [
          "Review available platform records.",
          "Verify the transaction with its authorised payment provider.",
          "Request explanations and evidence from the merchant and customer.",
          "Facilitate communication between the parties.",
          "Recommend a refund, replacement, correction or other reasonable resolution.",
          "Restrict a merchant account where credible evidence justifies protective action.",
          "Refer payment-related matters to the relevant payment provider or competent authority.",
        ],
      },
      {
        type: "p",
        text: "TIJAR acts as a platform facilitator and does not guarantee that every dispute will result in a refund or a particular outcome.",
      },
      {
        type: "p",
        text: "Any decision concerning a payment reversal, chargeback or payment-provider investigation remains subject to the applicable provider’s rules, payment arrangements and law.",
      },
      { type: "h3", text: "6.5 Investigation timelines" },
      {
        type: "p",
        text: "TIJAR will aim to acknowledge complaints within two (2) business days and provide an initial assessment or request for further information within five (5) business days.",
      },
      {
        type: "p",
        text: "Complex disputes may take longer where TIJAR needs information from merchants, delivery providers, banks or payment service providers.",
      },
      {
        type: "p",
        text: "Where an investigation is delayed, TIJAR will endeavour to communicate the reason and provide an updated expected timeline.",
      },
      {
        type: "p",
        text: "These service targets do not override any shorter or mandatory statutory or payment-provider deadlines.",
      },
      { type: "h3", text: "6.6 Final resolution and external remedies" },
      {
        type: "p",
        text: "Where TIJAR cannot resolve a dispute internally, the parties may pursue the remedies available under applicable Nigerian law, including approaching the Federal Competition and Consumer Protection Commission (FCCPC), the relevant sector regulator, a payment provider or a court with appropriate jurisdiction.",
      },
      {
        type: "p",
        text: "TIJAR’s internal process does not remove any lawful right to seek external redress.",
      },
    ],
  },
  {
    id: "refunds",
    title: "7. Refund and return policy",
    blocks: [
      { type: "h3", text: "7.1 General principle" },
      {
        type: "p",
        text: "Refunds for products and services supplied by independent merchants are primarily the responsibility of the merchant that supplied or agreed to supply those products or services.",
      },
      {
        type: "p",
        text: "TIJAR does not automatically become the seller or refund guarantor merely because a merchant lists products on the platform.",
      },
      {
        type: "p",
        text: "However, merchants must comply with applicable consumer-protection laws and any refund, return or warranty commitments they have made.",
      },
      { type: "h3", text: "7.2 Circumstances in which a refund may be appropriate" },
      {
        type: "p",
        text: "Subject to applicable law, the transaction terms and investigation, a refund, replacement or other remedy may be appropriate where:",
      },
      {
        type: "ul",
        items: [
          "A merchant fails to deliver an accepted and paid order.",
          "A product is materially different from its description.",
          "A product is defective or damaged.",
          "A merchant cannot fulfil an accepted order.",
          "A duplicate successful payment occurs.",
          "A payment is collected for an order that was cancelled or not supplied.",
          "An unauthorised or erroneous payment is established.",
          "A refund is otherwise required by applicable law or the agreed transaction terms.",
        ],
      },
      {
        type: "p",
        text: "The remedy will depend on the facts, the nature of the product or service and the customer’s legal rights.",
      },
      { type: "h3", text: "7.3 Change of mind" },
      {
        type: "p",
        text: "A customer who simply changes their mind after purchasing a product may not automatically qualify for a refund in every situation.",
      },
      {
        type: "p",
        text: "Any change-of-mind return will be considered under the merchant’s disclosed return policy and applicable Nigerian law.",
      },
      {
        type: "p",
        text: "Nothing in this section removes a consumer’s statutory right to return goods or obtain a remedy where the law provides one.",
      },
      { type: "h3", text: "7.4 Refund procedure" },
      { type: "p", text: "For an eligible on-platform transaction:" },
      {
        type: "ol",
        items: [
          "The customer submits a refund or dispute request through TIJAR.",
          "TIJAR verifies the transaction reference and available records.",
          "The merchant may be asked to respond and provide supporting evidence.",
          "TIJAR may facilitate an agreed resolution or refer a payment issue to its payment provider.",
          "Where a refund is approved by the responsible merchant or payment provider, it will be processed through the applicable payment channel.",
        ],
      },
      {
        type: "p",
        text: "TIJAR cannot promise an exact refund completion date where processing depends on a bank, card network, payment provider or other third party.",
      },
      { type: "h3", text: "7.5 Refunds for off-platform payments" },
      {
        type: "p",
        text: "Payments made directly to merchants outside TIJAR’s recognised payment process are not eligible for TIJAR’s platform-administered refund workflow.",
      },
      {
        type: "p",
        text: "Customers should contact the merchant and their bank or payment provider directly.",
      },
      { type: "p", text: "This does not restrict any remedy available under applicable law." },
      { type: "h3", text: "7.6 Duplicate, failed and reversed payments" },
      {
        type: "p",
        text: "Where a payment is duplicated, incorrectly debited or recorded as successful without the corresponding order or service being activated, the customer should report the issue with the relevant payment evidence.",
      },
      {
        type: "p",
        text: "TIJAR may assist with reconciliation and refer the issue to the authorised payment provider.",
      },
      {
        type: "p",
        text: "A failed payment that was never successfully debited ordinarily does not require a refund. Where an account was debited despite a failed or incomplete transaction, the matter will be investigated with the relevant provider.",
      },
      { type: "h3", text: "7.7 Refund of TIJAR’s own fees" },
      {
        type: "p",
        text: "Fees paid directly to TIJAR for its own services, such as subscriptions, advertising or AI credits, are separate from payments made to independent merchants.",
      },
      {
        type: "p",
        text: "The refund eligibility of those fees will depend on the service purchased, whether the service was delivered or consumed, the applicable product-specific terms and mandatory legal rights.",
      },
      {
        type: "p",
        text: "TIJAR may refund or credit a fee where it charged incorrectly, failed to provide a paid service or is otherwise required to do so by law.",
      },
    ],
  },
  {
    id: "limitation",
    title: "8. Limitation of TIJAR’s responsibility",
    blocks: [
      { type: "p", text: "To the extent permitted by applicable law, TIJAR is not responsible for:" },
      {
        type: "ul",
        items: [
          "Independent merchants’ representations, conduct or business decisions.",
          "Product quality, safety, authenticity or suitability where the product is supplied by a third-party merchant.",
          "A merchant’s failure to fulfil an order or honour an agreement.",
          "Delivery delays, loss or damage caused by independent logistics providers.",
          "Transactions independently arranged and completed outside TIJAR.",
          "Losses resulting from a customer’s failure to protect their account credentials or follow reasonable security precautions.",
          "Temporary interruptions caused by events outside TIJAR’s reasonable control.",
          "Decisions made independently by banks, payment processors or other third-party service providers.",
        ],
      },
      {
        type: "p",
        text: "This section does not exclude or limit liability where such exclusion or limitation is prohibited by law, including liability arising from TIJAR’s own fraud, wilful misconduct, negligence, misrepresentation or failure to perform its legal obligations.",
      },
      { type: "p", text: "Nothing in these Terms removes a consumer’s non-excludable statutory rights." },
    ],
  },
  {
    id: "payments",
    title: "9. Third-party payment providers",
    blocks: [
      {
        type: "p",
        text: "TIJAR may integrate with licensed banks, payment service providers, payment gateways and other financial infrastructure providers.",
      },
      { type: "p", text: "Where a third-party provider processes a payment:" },
      {
        type: "ul",
        items: [
          "The payment may be subject to that provider’s terms, verification procedures and operational rules.",
          "Payment authorisation, settlement, reversals and chargebacks may be controlled partly or entirely by the provider.",
          "TIJAR may share transaction information reasonably required to process, reconcile, investigate or support the transaction, in accordance with its Privacy Policy and applicable law.",
          "TIJAR does not guarantee uninterrupted availability of third-party payment services.",
        ],
      },
      {
        type: "p",
        text: "TIJAR will remain responsible for obligations that apply directly to its own conduct and services.",
      },
    ],
  },
  {
    id: "prohibited",
    title: "10. Prohibited conduct and account restrictions",
    blocks: [
      { type: "p", text: "TIJAR may investigate and take proportionate action where a user:" },
      {
        type: "ul",
        items: [
          "Engages in fraud, scams or payment manipulation.",
          "Submits false or fabricated transaction evidence.",
          "Repeatedly abuses the dispute or refund process.",
          "Sells prohibited or unlawful products.",
          "Harasses, threatens or defrauds another user.",
          "Attempts to bypass platform security or payment systems.",
          "Materially violates these Terms.",
        ],
      },
      {
        type: "p",
        text: "Depending on the circumstances, TIJAR may issue warnings, remove listings, restrict features, suspend accounts or terminate access.",
      },
      {
        type: "p",
        text: "Where appropriate, TIJAR may preserve relevant records and cooperate with competent law-enforcement or regulatory authorities in accordance with applicable law.",
      },
    ],
  },
  {
    id: "indemnity",
    title: "11. Indemnity",
    blocks: [
      {
        type: "p",
        text: "To the extent permitted by applicable law, a merchant or user who breaches these Terms, engages in unlawful conduct or infringes another person’s rights agrees to be responsible for losses, claims, liabilities and reasonable costs directly arising from that breach or conduct.",
      },
      {
        type: "p",
        text: "This provision does not require a consumer to indemnify TIJAR for TIJAR’s own negligence, fraud, wilful misconduct or breach of a non-excludable legal obligation.",
      },
    ],
  },
  {
    id: "security",
    title: "12. Account security",
    blocks: [
      {
        type: "p",
        text: "Users are responsible for maintaining the confidentiality of their login credentials and promptly reporting suspected unauthorised access.",
      },
      {
        type: "p",
        text: "Users should not share passwords, one-time passwords, payment PINs or other authentication credentials with merchants or other users.",
      },
      {
        type: "p",
        text: "TIJAR will apply reasonable security measures to protect its systems and user information, in accordance with applicable law and its Privacy Policy.",
      },
    ],
  },
  {
    id: "privacy",
    title: "13. Privacy and data processing",
    blocks: [
      {
        type: "p",
        text: "TIJAR may process personal information to operate the platform, facilitate transactions, investigate complaints, prevent fraud, provide customer support and meet legal obligations.",
      },
      {
        type: "p",
        text: "Personal information will be handled in accordance with TIJAR’s Privacy Policy and applicable Nigerian data-protection requirements.",
      },
      {
        type: "p",
        text: "Users should consult the Privacy Policy for details about data collection, use, retention, sharing and their applicable rights.",
      },
    ],
  },
  {
    id: "availability",
    title: "14. Service availability",
    blocks: [
      { type: "p", text: "TIJAR will use reasonable efforts to maintain the availability and security of its platform." },
      {
        type: "p",
        text: "However, access may occasionally be interrupted for maintenance, updates, technical faults, security incidents, network failures or events outside TIJAR’s reasonable control.",
      },
      {
        type: "p",
        text: "Where reasonably practicable, TIJAR will take appropriate steps to restore affected services.",
      },
    ],
  },
  {
    id: "changes",
    title: "15. Changes to these Terms",
    blocks: [
      {
        type: "p",
        text: "TIJAR may update these Terms to reflect changes in its services, technology, business model, payment arrangements or applicable law.",
      },
      {
        type: "p",
        text: "Material changes will be communicated through appropriate platform notices or other reasonable channels.",
      },
      {
        type: "p",
        text: "Where required by law, TIJAR will obtain renewed acceptance before applying material changes to existing users or transactions.",
      },
      {
        type: "p",
        text: "The version applicable to a particular transaction will be determined in accordance with applicable law and the relevant transaction terms.",
      },
    ],
  },
  {
    id: "law",
    title: "16. Governing law and disputes",
    blocks: [
      { type: "p", text: "These Terms are governed by the laws of the Federal Republic of Nigeria." },
      {
        type: "p",
        text: "The parties should first attempt to resolve disputes through good-faith communication and TIJAR’s applicable internal process.",
      },
      {
        type: "p",
        text: "Where a dispute remains unresolved, either party may pursue available remedies before a competent Nigerian court or relevant regulatory authority.",
      },
      { type: "p", text: "Nothing in these Terms prevents a consumer from exercising a statutory right to seek redress." },
    ],
  },
  {
    id: "contact",
    title: "17. Contact and complaints",
    blocks: [
      {
        type: "p",
        text: "For marketplace complaints, transaction support, refund requests or questions about these Terms, contact TIJAR Support.",
      },
    ],
  },
  {
    id: "acknowledgement",
    title: "18. Acknowledgement",
    blocks: [
      {
        type: "p",
        text: "By selecting “I Agree”, creating an account or continuing to use the relevant TIJAR services, you acknowledge that you have had the opportunity to review these Terms and agree to the provisions applicable to your use of the platform.",
      },
      { type: "p", text: "TIJAR — Making Every Business Visible." },
    ],
  },
];

export function MarketplaceTermsDocument() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Legal</p>
      <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">
        TIJAR marketplace terms of service, dispute resolution and refund policy
      </h1>
      <p className="mt-5 text-sm text-muted-foreground">
        Effective 1 November 2026 · Last updated 1 November 2026 · Operator: Tijar Limited
      </p>
      <div className="mt-12 space-y-12 leading-8 text-muted-foreground">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id}>
            <h2 className="text-2xl font-extrabold text-foreground">{section.title}</h2>
            <div className="mt-4 space-y-4">
              {section.blocks.map((block, i) => (
                <BlockView key={`${section.id}-${i}`} block={block} />
              ))}
            </div>
            {section.id === "contact" ? <ContactBlock /> : null}
          </section>
        ))}
      </div>
    </article>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "h3") {
    return <h3 className="pt-2 text-lg font-extrabold text-foreground">{block.text}</h3>;
  }
  if (block.type === "p") {
    return <p>{block.text}</p>;
  }
  if (block.type === "note") {
    return (
      <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground">
        {block.text}
      </p>
    );
  }
  const Tag = block.type === "ol" ? "ol" : "ul";
  return (
    <Tag className={block.type === "ol" ? "list-decimal space-y-2 pl-5" : "list-disc space-y-2 pl-5"}>
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Tag>
  );
}

function ContactBlock() {
  return (
    <address className="mt-4 not-italic">
      <p className="font-extrabold text-foreground">TIJAR Support</p>
      <p className="mt-2">
        Email:{" "}
        <a className="font-semibold text-primary" href="mailto:tijar.ng@gmail.com">
          tijar.ng@gmail.com
        </a>
        {" · "}
        <a className="font-semibold text-primary" href="mailto:info@tijar.ng">
          info@tijar.ng
        </a>
      </p>
      <p>
        Telephone / WhatsApp:{" "}
        <a className="font-semibold text-primary" href="tel:+2348149397002">
          08149397002
        </a>
        {" · "}
        <a className="font-semibold text-primary" href="tel:+2348124444169">
          08124444169
        </a>
      </p>
      <p>
        Website:{" "}
        <a className="font-semibold text-primary" href="https://www.tijar.ng">
          www.tijar.ng
        </a>
      </p>
      <p>Registered business address: No. 505 AUA Tech HQ, Kofar Dawanau, along University Road, Kano.</p>
      <p className="mt-2">Please include your TIJAR account details and transaction reference where applicable.</p>
    </address>
  );
}
