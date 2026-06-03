import { yogoFetch } from "./fetch";

// ─── Types ──────────────────────────────────────────────────────────

export interface YogoDiscountCode {
  id: number;
  archived: boolean;
  name: string;
  type: "discount_percent" | "discount_amount";
  discount_percent: number;
  discount_amount: number;
  valid_for_items: string[];
  has_customer_limit: boolean;
  customer_limit: number;
  has_use_per_customer_limit: boolean;
  use_per_customer_limit: number;
  active: boolean;
  membership_discount_on_limited_number_of_payments: boolean;
  membership_discount_number_of_payments: number;
  valid_for_membership_registration_fee: boolean;
  client_id: number;
  membership_campaign: unknown;
}

export type RewardConfig =
  | { type: "free_month" }
  | { type: "fixed_amount"; amountCents: number };

export interface ApplyDiscountResult {
  discountCodeId: number;
  discountCodeName: string;
}

// ─── Create discount code ───────────────────────────────────────────

export async function createDiscountCode(
  name: string,
  reward: RewardConfig,
): Promise<YogoDiscountCode> {
  const body =
    reward.type === "free_month"
      ? {
          name,
          type: "discount_percent" as const,
          discount_percent: 100,
          discount_amount: 0,
          valid_for_items: ["membership_types"],
          has_use_per_customer_limit: true,
          use_per_customer_limit: 1,
          has_customer_limit: true,
          customer_limit: 1,
          active: true,
          membership_discount_on_limited_number_of_payments: true,
          membership_discount_number_of_payments: 1,
          valid_for_membership_registration_fee: false,
        }
      : {
          name,
          type: "discount_amount" as const,
          discount_percent: 0,
          discount_amount: reward.amountCents,
          valid_for_items: ["membership_types"],
          has_use_per_customer_limit: true,
          use_per_customer_limit: 1,
          has_customer_limit: true,
          customer_limit: 1,
          active: true,
          membership_discount_on_limited_number_of_payments: true,
          membership_discount_number_of_payments: 1,
          valid_for_membership_registration_fee: false,
        };

  const res = await yogoFetch<YogoDiscountCode>("discount-codes", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to create discount code "${name}": ${res.status} ${res.rawText}`,
    );
  }

  return res.data;
}

// ─── Apply discount code to membership ──────────────────────────────

export async function applyDiscountToMembership(
  membershipId: number,
  discountCodeId: number,
  paymentsToDiscount: number = 1,
): Promise<void> {
  const res = await yogoFetch(`memberships/${membershipId}`, {
    method: "PUT",
    body: JSON.stringify({
      discount_code: discountCodeId,
      discount_code_applies_to_limited_number_of_payments: true,
      discount_code_number_of_reduced_payments_left: paymentsToDiscount,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to apply discount ${discountCodeId} to membership ${membershipId}: ${res.status} ${res.rawText}`,
    );
  }
}

// ─── Delete discount code ──────────────────────────────────────────

export async function deleteDiscountCode(
  discountCodeId: number,
): Promise<void> {
  const res = await yogoFetch(`discount-codes/${discountCodeId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    throw new Error(
      `Failed to delete discount code ${discountCodeId}: ${res.status} ${res.rawText}`,
    );
  }
}

// ─── Convenience: create + apply in one call ────────────────────────

export async function grantLoyaltyReward(
  membershipId: number,
  yogoCustomerId: number,
  levelId: number,
  reward: RewardConfig,
): Promise<ApplyDiscountResult> {
  const codeName = `LOYALTY_${levelId}_${yogoCustomerId}`;
  const code = await createDiscountCode(codeName, reward);
  await applyDiscountToMembership(membershipId, code.id);
  return { discountCodeId: code.id, discountCodeName: code.name };
}
