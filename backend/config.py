import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# LLM provider — any OpenAI-compatible endpoint (Groq, OpenAI, Together, Mistral, Ollama, …)
# LLM_API_KEY falls back to GROQ_API_KEY so existing .env files keep working.
LLM_API_KEY  = os.environ.get("LLM_API_KEY") or os.environ.get("GROQ_API_KEY", "")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_MODEL    = os.environ.get("LLM_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

# Legacy alias kept for the startup validation check in main.py
GROQ_API_KEY = LLM_API_KEY
GROQ_MODEL   = LLM_MODEL

LANGFUSE_PUBLIC_KEY = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.environ.get("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = (
    os.environ.get("LANGFUSE_HOST")
    or os.environ.get("LANGFUSE_BASE_URL")
    or "https://cloud.langfuse.com"
)

SIMILARITY_THRESHOLD = 0.40
SCORE_THRESHOLD = 0.50
NAICS_BYPASS_THRESHOLD = 0.60

TOP_K_VECTORS = 50
DENSE_SAFETY_NET = 10

SCORE_WEIGHTS = {
    "core_offerings": 0.50,
    "description":    0.50,
}

QDRANT_HOST = "localhost"
QDRANT_PORT = 6333

EMBEDDING_MODEL = "BAAI/bge-m3"
EMBEDDING_DIM = 1024

COLLECTIONS = ["core_offerings", "description"]

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
COMPANIES_JSONL = os.path.join(DATA_DIR, "companies_no_duplicates.jsonl")
COMPANIES_PARSED = os.path.join(DATA_DIR, "companies_parsed.pkl")
NAICS_FILE = os.path.join(DATA_DIR, "unique_naics.txt")

COUNTRY_MAPPING = {
    "argentina": "ar", "austria": "at", "australia": "au", "belgium": "be",
    "brazil": "br", "canada": "ca", "switzerland": "ch", "chile": "cl",
    "china": "cn", "germany": "de", "denmark": "dk", "egypt": "eg",
    "spain": "es", "finland": "fi", "france": "fr", "united kingdom": "gb",
    "uk": "gb", "great britain": "gb", "greece": "gr", "hong kong": "hk",
    "croatia": "hr", "indonesia": "id", "ireland": "ie", "india": "in",
    "iceland": "is", "italy": "it", "japan": "jp", "south korea": "kr",
    "korea": "kr", "kuwait": "kw", "lithuania": "lt", "luxembourg": "lu",
    "netherlands": "nl", "holland": "nl", "norway": "no", "new zealand": "nz",
    "poland": "pl", "portugal": "pt", "romania": "ro", "russia": "ru",
    "sweden": "se", "singapore": "sg", "turkey": "tr", "taiwan": "tw",
    "ukraine": "ua", "united states": "us", "usa": "us", "us": "us",
    "vietnam": "vn",
    "scandinavia": ["se", "no", "dk", "fi"],
    "nordic": ["se", "no", "dk", "fi", "is"],
    "europe": ["at", "be", "ch", "de", "dk", "es", "fi", "fr", "gb", "gr",
               "hr", "ie", "is", "it", "lt", "lu", "nl", "no", "pl", "pt",
               "ro", "se", "ua"],
    "european union": ["at", "be", "de", "dk", "es", "fi", "fr", "gr", "hr",
                       "ie", "it", "lt", "lu", "nl", "pl", "pt", "ro", "se"],
    "eu": ["at", "be", "de", "dk", "es", "fi", "fr", "gr", "hr", "ie", "it",
           "lt", "lu", "nl", "pl", "pt", "ro", "se"],
    "benelux": ["be", "nl", "lu"],
    "north america": ["us", "ca"],
    "asia": ["cn", "in", "jp", "kr", "sg", "tw", "hk", "id", "vn"],
    "southeast asia": ["sg", "id", "vn", "tw", "hk"],
    "sea": ["sg", "id", "vn", "tw", "hk"],
    "apac": ["cn", "in", "jp", "kr", "sg", "tw", "hk", "id", "vn", "au", "nz"],
    "south america": ["ar", "br", "cl"],
    "latam": ["ar", "br", "cl"],
    "middle east": ["kw", "tr", "eg"],
}
