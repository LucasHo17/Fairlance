"""
seed_cleaner.py — Clean up all seeded mock data from the database.

Usage:
    python -m app.data.seed_cleaner
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from app.data.db import get_client


def run_cleanup():
    client = get_client()

    print("Fetching seeded users…")
    users = client.table("users").select("id, email").execute().data or []
    seed_users = [
        u for u in users 
        if u["email"].startswith("seed_user_") or u["email"].startswith("test_user_seed")
    ]

    if not seed_users:
        print("No seed users found. Database is already clean.")
        return

    user_ids = [u["id"] for u in seed_users]
    emails = [u["email"] for u in seed_users]
    print(f"Found {len(user_ids)} seed users to clean up:\n  " + "\n  ".join(emails))

    # 1. Delete transactions where customer_id or freelancer_id matches these user IDs
    print("Deleting transactions related to seed users…")
    tx_res_customer = client.table("transactions").delete().in_("customer_id", user_ids).execute()
    customer_del_count = len(tx_res_customer.data or [])
    print(f"  Deleted {customer_del_count} customer transactions.")
    
    tx_res_freelancer = client.table("transactions").delete().in_("freelancer_id", user_ids).execute()
    freelancer_del_count = len(tx_res_freelancer.data or [])
    print(f"  Deleted {freelancer_del_count} freelancer transactions.")

    # 2. Delete the auth users using Auth Admin API (this will cascade delete profiles, listings, and offers)
    print("Deleting users from Supabase Auth (cascades to profiles, listings, and offers)…")
    deleted_count = 0
    for uid in user_ids:
        try:
            client.auth.admin.delete_user(uid)
            deleted_count += 1
        except Exception as e:
            print(f"  Error deleting auth user {uid}: {e}")

    print(f"\nCleanup complete. Successfully removed {deleted_count} auth users and all cascading data.")


if __name__ == "__main__":
    run_cleanup()
