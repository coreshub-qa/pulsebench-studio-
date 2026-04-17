backend-dev:
	cd backend && uvicorn app:app --reload --host 0.0.0.0 --port 8080

frontend-dev:
	cd frontend && npm run dev -- --host 0.0.0.0 --port 5173

build-frontend:
	cd frontend && npm install && npm run build

