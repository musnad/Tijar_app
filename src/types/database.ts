export type OnboardingStatus = "not_started" | "in_progress" | "completed";
export type AccountMode = "customer" | "business" | "both";
export type ActiveMode = "customer" | "business";

export type Profile = {
  id: string;
  auth_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  preferred_language: string;
  onboarding_status: OnboardingStatus;
  account_mode?: AccountMode;
  active_mode?: ActiveMode;
  /** OpenAI TTS stock voice (nova, alloy, …). */
  preferred_tts_voice?: string | null;
  /** Storage path of enrolled voice sample. */
  voice_sample_path?: string | null;
  /** Provider clone id (e.g. ElevenLabs). */
  custom_voice_id?: string | null;
  voice_enrolled_at?: string | null;
  state?: string | null;
  lga?: string | null;
  location_text?: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerAddress = {
  id: string;
  profile_id: string;
  label: string;
  full_name: string;
  phone: string;
  state: string;
  city: string;
  lga: string | null;
  street: string;
  instructions: string | null;
  is_default: boolean;
};

export type CartItem = {
  id: string;
  cart_id: string;
  business_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product_name: string;
  unit: string;
  image_url: string | null;
  variant_id?: string | null;
  variant_label?: string | null;
};

export type MarketplaceOrder = {
  id: string;
  order_number: string;
  buyer_profile_id: string;
  business_id: string;
  status: string;
  fulfilment: string;
  subtotal: number;
  delivery_fee: number;
  payment_fee?: number;
  total: number;
  platform_fee_ngn?: number | null;
  seller_net_ngn?: number | null;
  currency: string;
  buyer_phone: string | null;
  buyer_note: string | null;
  is_order_request?: boolean;
  payment_method?: string | null;
  payment_destination?: string | null;
  buyer_marked_paid_at?: string | null;
  sale_transaction_id?: string | null;
  created_at: string;
};

export type MarketplaceOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url: string | null;
  variant_label?: string | null;
  snapshot?: Record<string, unknown>;
};

export type BusinessCategory = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export type ListingModerationStatus = "pending" | "approved" | "flagged" | "suspended";

export type Business = {
  id: string;
  owner_id: string;
  business_name: string;
  category_id: string | null;
  subcategory_id: string | null;
  description: string | null;
  location: string | null;
  logo_url: string | null;
  cover_image_url?: string | null;
  islamic_mode_enabled: boolean;
  verification_status: string;
  kyc_provider?: string | null;
  kyc_id_type?: string | null;
  kyc_id_last4?: string | null;
  kyc_full_name?: string | null;
  kyc_verified_at?: string | null;
  kyc_reference?: string | null;
  kyc_details?: Record<string, unknown> | null;
  kyc_face_matched?: boolean;
  kyc_dob?: string | null;
  kyc_phone?: string | null;
  kyc_gender?: string | null;
  kyc_state?: string | null;
  kyc_masked_id?: string | null;
  cac_number?: string | null;
  cac_legal_name?: string | null;
  cac_status?: string | null;
  cac_verified_at?: string | null;
  cac_details?: Record<string, unknown> | null;
  /** Blue tick on the public shop name. Independent of KYC approval. */
  verified_badge?: boolean;
  public_slug: string | null;
  is_published: boolean;
  public_phone: string | null;
  public_whatsapp: string | null;
  opening_hours: Record<string, string>;
  latitude: number | null;
  longitude: number | null;
  public_location_label: string | null;
  location_approved: boolean;
  moderation_status: ListingModerationStatus;
  moderation_notes: string | null;
  published_at: string | null;
  /** Informal micro-traders / artisans — Marketplace lists these only. */
  is_informal?: boolean;
  payout_account_name?: string | null;
  payout_account_number?: string | null;
  payout_bank_name?: string | null;
  payout_bank_code?: string | null;
  virtual_account_name?: string | null;
  virtual_account_number?: string | null;
  virtual_account_bank_name?: string | null;
  virtual_account_bank_code?: string | null;
  virtual_account_reference?: string | null;
  virtual_account_provider?: string | null;
  virtual_accounts?: Array<{
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode?: string | null;
    bank?: string | null;
    reference?: string | null;
  }> | null;
  created_at?: string;
};

export type BusinessPayoutAccount = {
  business_id: string;
  business_name: string;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_bank_name: string | null;
  payout_bank_code: string | null;
};

export type SellerWallet = {
  business_id: string;
  available_ngn: number;
  pending_ngn: number;
};

export type WalletCredit = {
  id: string;
  business_id: string;
  provider: string;
  provider_reference: string;
  amount_ngn: number;
  account_number: string | null;
  created_at: string;
};

export type PayoutRequest = {
  id: string;
  business_id: string;
  amount_ngn: number;
  status: string;
  provider_reference: string | null;
  note: string | null;
  created_at: string;
};

/** Row of the public_business_listings view — public fields only. */
export type PublicBusiness = {
  id: string;
  slug: string;
  business_name: string;
  description: string | null;
  location_text: string | null;
  public_location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  cover_image_url?: string | null;
  category_id: string | null;
  category_name: string | null;
  public_phone: string | null;
  public_whatsapp: string | null;
  opening_hours: Record<string, string>;
  is_verified: boolean;
  verification_status: string;
  is_informal?: boolean;
  distance_km?: number | null;
  product_names?: string[];
};

export type PublicProduct = {
  id: string;
  business_id: string;
  name: string;
  kind: ProductKind;
  description: string | null;
  sale_price: number | null;
  unit: string;
  image_url: string | null;
  extra_image_urls?: string[];
  video_url?: string | null;
  attributes?: Record<string, string> | null;
  variants?: unknown;
  currency?: string;
  is_available: boolean;
  created_at?: string;
  updated_at?: string;
  is_informal?: boolean;
  business_name?: string | null;
  business_slug?: string | null;
  business_logo_url?: string | null;
  category_name?: string | null;
  service_type?: ServiceType;
  starts_on?: string | null;
  ends_on?: string | null;
};

export type ServiceEnrollment = {
  id: string;
  business_id: string;
  product_id: string;
  customer_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "requested" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  created_at: string;
};

export type BusinessEnquiry = {
  id: string;
  business_id: string;
  profile_id?: string | null;
  product_id?: string | null;
  customer_name: string;
  customer_phone: string | null;
  message: string;
  is_read: boolean;
  seller_reply?: string | null;
  replied_at?: string | null;
  created_at: string;
};

export type NotificationPreferences = {
  profile_id: string;
  general: boolean;
  likes: boolean;
  comments: boolean;
  order_updates: boolean;
  enquiry_replies: boolean;
  followed_shops: boolean;
  marketing: boolean;
};

export type BusinessDna = {
  business_id: string;
  business_model: string | null;
  revenue_models: string[];
  customer_types: string[];
  payment_methods: string[];
  customer_credit_enabled: boolean | null;
  supplier_credit_enabled: boolean | null;
  inventory_required: boolean | null;
  has_staff: boolean | null;
  record_keeping_methods: string[];
  discovery_channels: string[];
  goals: string[];
};

export type TransactionType =
  | "sale"
  | "expense"
  | "purchase"
  | "customer_payment"
  | "supplier_payment";

export type Customer = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  notes: string | null;
  balance_owed: number;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  balance_owed: number;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  business_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  payment_method: string | null;
  description: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  product_id: string | null;
  quantity: number | null;
  line_cost: number | null;
  line_profit: number | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
};

export type ProductKind = "goods" | "service";
export type ServiceType = "general" | "course" | "mentorship";

export type Product = {
  id: string;
  business_id: string;
  name: string;
  kind: ProductKind;
  unit: string;
  sale_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_published?: boolean;
  image_url: string | null;
  extra_image_urls?: string[];
  video_url?: string | null;
  description?: string | null;
  attributes?: Record<string, string>;
  variants?: unknown;
  currency?: string;
  catalogue_category?: string | null;
  service_type?: ServiceType;
  starts_on?: string | null;
  ends_on?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductSalesStats = {
  productId: string;
  saleCount: number;
  revenue: number;
  profit: number;
};

export type StockMovementReason = "initial" | "purchase" | "sale" | "adjustment" | "return";

export type TransactionListItem = Transaction & {
  customers: { name: string } | null;
  suppliers: { name: string } | null;
  products: { name: string; image_url: string | null } | null;
};
