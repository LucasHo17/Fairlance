"""
seed_loader.py — Populates the database with realistic, high-quality demo data.
"""
from __future__ import annotations

import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from app.data.db import get_client
from app.data.seed_cleaner import run_cleanup

# Pricing profiles keyed by category slug.
# Each tuple is (mean_price, std_dev) in USD/hr.
CATEGORY_PRICE_PROFILES: dict[str, tuple[float, float]] = {
    "web-development":   (90,  25),
    "graphic-design":    (55,  18),
    "photography":       (65,  20),
    "video-editing":     (60,  18),
    "tutoring":          (40,  12),
    "writing-editing":   (45,  14),
    "music-audio":       (55,  16),
    "landscaping":       (35,  10),
    "cleaning":          (30,   8),
    "moving-help":       (40,  10),
    "handyman-services": (45,  12),
    "data-entry":        (25,   7),
    "social-media":      (42,  13),
    "translation":       (48,  14),
    "event-planning":    (58,  17),
}

# Real freelancer details corresponding to each category
FREELANCERS_METADATA = [
    {
        "slug": "web-development",
        "name": "Alex Rivera",
        "business_name": "Rivera Tech Solutions",
        "summary": "Senior full-stack engineer and software architect. Specializing in high-performance web applications using React, Next.js, and Node.js.",
        "service_area": "Amherst, MA",
        "zip_code": "01002"
    },
    {
        "slug": "graphic-design",
        "name": "Sarah Chen",
        "business_name": "Chen Design Lab",
        "summary": "Visual designer with 6+ years of experience helping startups build modern brand identities, high-fidelity landing pages, and responsive design systems.",
        "service_area": "Northampton, MA",
        "zip_code": "01060"
    },
    {
        "slug": "photography",
        "name": "Marco Rossi",
        "business_name": "Rossi Studio",
        "summary": "Professional editorial and product photographer. Offering studio commercial shots, headshots, and scenic photography for creative campaigns.",
        "service_area": "Hadley, MA",
        "zip_code": "01035"
    },
    {
        "slug": "video-editing",
        "name": "Elena Petrova",
        "business_name": "Petrova Media",
        "summary": "Creative video editor and filmmaker. Crafting high-quality promotional videos, YouTube content, and storytelling reels.",
        "service_area": "South Hadley, MA",
        "zip_code": "01075"
    },
    {
        "slug": "tutoring",
        "name": "James Wilson",
        "business_name": "Wilson Academics",
        "summary": "Patient tutor specializing in AP/college level Calculus, Physics, and statistics. Helping students gain confidence and top grades.",
        "service_area": "Amherst, MA",
        "zip_code": "01002"
    },
    {
        "slug": "writing-editing",
        "name": "Emma Watson",
        "business_name": "Watson Copywriting",
        "summary": "Copywriter and SEO strategist. Producing highly engaging blog posts, landing page copies, and technical whitepapers that rank and convert.",
        "service_area": "Northampton, MA",
        "zip_code": "01060"
    },
    {
        "slug": "music-audio",
        "name": "Liam Gallagher",
        "business_name": "Gallagher Sound Co",
        "summary": "Audio producer, mastering engineer, and sound designer. Providing high-fidelity vocal editing, audio cleaning, and original music production.",
        "service_area": "Hadley, MA",
        "zip_code": "01035"
    },
    {
        "slug": "landscaping",
        "name": "Oliver Twist",
        "business_name": "Twist Gardening & Lawn",
        "summary": "Reliable lawn maintenance, garden planning, weed control, and general outdoor yard cleanups for both residential and business properties.",
        "service_area": "South Hadley, MA",
        "zip_code": "01075"
    },
    {
        "slug": "cleaning",
        "name": "Sophia Loren",
        "business_name": "Loren Cleaners",
        "summary": "Meticulous apartment and office cleaning services. Using eco-friendly products to leave your space spotless and fresh.",
        "service_area": "Amherst, MA",
        "zip_code": "01002"
    },
    {
        "slug": "moving-help",
        "name": "Lucas Silva",
        "business_name": "Silva Moving & Heavy Lifting",
        "summary": "Strong mover with own pickup truck. Available for packing, heavy furniture assembly, loading, and local transport around the Valley.",
        "service_area": "Northampton, MA",
        "zip_code": "01060"
    },
    {
        "slug": "handyman-services",
        "name": "Bob Builder",
        "business_name": "Bob's Home Repairs",
        "summary": "Your local home maintenance expert. Mounting TVs, fixing drywall patches, minor plumbing repairs, and furniture assemblies.",
        "service_area": "Hadley, MA",
        "zip_code": "01035"
    },
    {
        "slug": "data-entry",
        "name": "Jane Doe",
        "business_name": "Doe Virtual Services",
        "summary": "Fast, highly accurate data analyst. Proficient in database cleanup, Google Sheets/Excel organization, transcription, and admin workflows.",
        "service_area": "South Hadley, MA",
        "zip_code": "01075"
    },
    {
        "slug": "social-media",
        "name": "Kylie Jenner",
        "business_name": "Kylie Digital Studio",
        "summary": "Social media content creator and growth manager. Developing grid aesthetics, schedules, captions, and brand community engagement.",
        "service_area": "Amherst, MA",
        "zip_code": "01002"
    },
    {
        "slug": "translation",
        "name": "Jean Paul",
        "business_name": "Global Translations",
        "summary": "Professional native French and Spanish translator. Specializing in document translation, transcripts, and website localizations.",
        "service_area": "Northampton, MA",
        "zip_code": "01060"
    },
    {
        "slug": "event-planning",
        "name": "Monica Geller",
        "business_name": "Geller Event Coordination",
        "summary": "Ultra-organized event planning for corporate lunches, graduation parties, and weddings. Creating stress-free days.",
        "service_area": "Hadley, MA",
        "zip_code": "01035"
    }
]

SAMPLES_PER_CATEGORY = 40  # transactions per category
SEED_USER_COUNT = 15       # 15 freelancers, 15 customers

REVIEW_TEMPLATES = [
    {"body": "Absolutely outstanding work! Highly recommend.", "ratings": {"communication": 5, "quality": 5, "speed": 5}},
    {"body": "Delivered exactly what was asked for. Smooth communication.", "ratings": {"communication": 5, "quality": 4, "speed": 5}},
    {"body": "Very professional and fast delivery. Will hire again.", "ratings": {"communication": 5, "quality": 5, "speed": 4}},
    {"body": "Good quality of work overall, took slightly longer than expected but satisfied.", "ratings": {"communication": 4, "quality": 4, "speed": 3}},
    {"body": "Fantastic to deal with. Extremely patient and detailed.", "ratings": {"communication": 5, "quality": 5, "speed": 5}},
    {"body": "Amazing value for money, went above and beyond my expectations.", "ratings": {"communication": 5, "quality": 5, "speed": 5}},
    {"body": "Reliable and great attention to detail. Recommended!", "ratings": {"communication": 4, "quality": 5, "speed": 4}}
]


def _past(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def run_seed():
    client = get_client()

    # Automatically purge previous seed data to guarantee a clean starting state
    print("Purging existing seeded data...")
    run_cleanup()

    print("\nFetching categories…")
    cats = client.table("categories").select("id, slug").execute().data or []
    if not cats:
        raise RuntimeError(
            "No categories found. Run `supabase db reset` first."
        )
    cat_map: dict[str, str] = {c["slug"]: c["id"] for c in cats}

    # 1. Seed Users (15 freelancers, 15 customers)
    print(f"Seeding {SEED_USER_COUNT} freelancers and {SEED_USER_COUNT} customers…")
    freelancer_ids: list[str] = []
    customer_ids:   list[str] = []

    # Seeding Freelancers
    for i, meta in enumerate(FREELANCERS_METADATA):
        email = f"seed_user_{i}@example.com"
        try:
            user_res = client.auth.admin.create_user({
                "email": email,
                "password": "Password123",
                "email_confirm": True,
                "user_metadata": {
                    "role": "freelancer",
                    "full_name": meta["name"]
                }
            })
            uid = user_res.user.id
            freelancer_ids.append(uid)
            
            # Update public.users table with freelancer-specific fields (trigger created base record)
            client.table("users").update({
                "business_name": meta["business_name"],
                "summary": meta["summary"],
                "service_area": meta["service_area"],
                "zip_code": meta["zip_code"]
            }).eq("id", uid).execute()
            
            print(f"  Created Freelancer: {meta['name']} ({email})")
        except Exception as e:
            print(f"  Error creating freelancer {email}: {e}")

    # Seeding Customers
    for i in range(SEED_USER_COUNT):
        email = f"seed_user_{i + SEED_USER_COUNT}@example.com"
        try:
            user_res = client.auth.admin.create_user({
                "email": email,
                "password": "Password123",
                "email_confirm": True,
                "user_metadata": {
                    "role": "customer",
                    "full_name": f"Client User {i + 1}"
                }
            })
            uid = user_res.user.id
            customer_ids.append(uid)
            print(f"  Created Customer: Client User {i + 1} ({email})")
        except Exception as e:
            print(f"  Error creating customer {email}: {e}")

    # 2. Seed Listings (1 listing per freelancer mapping to all 15 categories)
    print("\nSeeding Listings and Pricing Models…")
    listings_by_cat: dict[str, str] = {}
    for fi, fid in enumerate(freelancer_ids):
        meta = FREELANCERS_METADATA[fi]
        cat_id = cat_map.get(meta["slug"])
        if not cat_id:
            continue
        
        listing_id = str(uuid.uuid4())
        client.table("listings").insert({
            "id":            listing_id,
            "freelancer_id": fid,
            "category_id":   cat_id,
            "title":         f"Premium {meta['slug'].replace('-', ' ').title()} Services",
            "description":   f"Professional, top-rated {meta['slug'].replace('-', ' ')} service based in {meta['service_area']}. Offering customizable strategies and satisfaction guaranteed.",
            "is_active":     True,
        }).execute()
        
        # Seed the corresponding pricing model (So pricing isn't $0 on home page!)
        base_rate, _ = CATEGORY_PRICE_PROFILES[meta["slug"]]
        client.table("pricing_models").insert({
            "listing_id":    listing_id,
            "strategy_type": "hourly",
            "base_price":    base_rate,
            "unit":          "per hour"
        }).execute()

        listings_by_cat[meta["slug"]] = listing_id
        print(f"  Listing + Pricing Model seeded for {meta['name']} (rate: ${base_rate}/hr)")

    # 3. Seed Offers & Transactions
    print("\nSeeding Offers, Transactions, and Organic Reviews…")
    tx_count = 0
    review_count = 0
    
    for fi, fid in enumerate(freelancer_ids):
        meta = FREELANCERS_METADATA[fi]
        cat_id = cat_map.get(meta["slug"])
        listing_id = listings_by_cat.get(meta["slug"])
        
        if not cat_id or not listing_id:
            continue

        mean, std = CATEGORY_PRICE_PROFILES[meta["slug"]]
        
        # Decide how many reviews to write for this freelancer (e.g. between 4 and 8)
        num_reviews_to_create = random.randint(4, 8)
        review_indices = set(random.sample(range(SAMPLES_PER_CATEGORY), num_reviews_to_create))

        for j in range(SAMPLES_PER_CATEGORY):
            price = max(10.0, round(random.gauss(mean, std), 2))
            days_ago = random.randint(1, 365)
            cid = customer_ids[j % len(customer_ids)]

            # Offer
            offer_id = str(uuid.uuid4())
            client.table("offers").insert({
                "id":            offer_id,
                "customer_id":   cid,
                "freelancer_id": fid,
                "listing_id":    listing_id,
                "amount":        price,
                "status":        "active",
                "created_at":    _past(days_ago + 1),
            }).execute()

            # Transaction
            tx_id = str(uuid.uuid4())
            client.table("transactions").insert({
                "id":            tx_id,
                "offer_id":      offer_id,
                "customer_id":   cid,
                "freelancer_id": fid,
                "listing_id":    listing_id,
                "category_id":   cat_id,
                "final_price":   price,
                "completed_at":  _past(days_ago),
            }).execute()
            tx_count += 1

            # Seed Review organic variation
            if j in review_indices:
                template = random.choice(REVIEW_TEMPLATES)
                client.table("reviews").insert({
                    "transaction_id": tx_id,
                    "body":           template["body"],
                    "ratings":        template["ratings"]
                }).execute()
                review_count += 1

        print(f"  {meta['slug']}: Seeded 40 transactions and {num_reviews_to_create} organic reviews.")

    print(f"\nSeed complete! Summary:")
    print(f"  - {SEED_USER_COUNT * 2} Users created")
    print(f"  - {len(listings_by_cat)} Active Listings & Pricing Models created")
    print(f"  - {tx_count} Transactions inserted")
    print(f"  - {review_count} Reviews generated (freelancer ratings views are populated!)")


if __name__ == "__main__":
    run_seed()