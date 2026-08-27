.PHONY: build install clean

# Default OS to Linux if not specified, but this should be run natively or via scripts/install.sh
OS ?= $(shell uname -s | tr A-Z a-z)
ARCH ?= $(shell uname -m)
BIN_DIR = $(HOME)/.local/bin

build: build-api build-cli

build-api:
	@echo "=> Building Qmon API (Backend)..."
	cd api && go build -o ../build/qmon-server main.go
	@echo "=> Qmon server built successfully."

build-cli:
	@echo "=> Building Qmon CLI (Frontend)..."
	# Bun can compile the TypeScript source into a standalone executable
	cd cli && bun build ./src/index.tsx --compile --outfile ../build/qmon
	@echo "=> Qmon CLI built successfully."

install: build
	@echo "=> Installing to $(BIN_DIR)..."
	mkdir -p $(BIN_DIR)
	cp build/qmon-server $(BIN_DIR)/qmon-server
	cp build/qmon $(BIN_DIR)/qmon
	@echo "=> Installation complete!"
	@echo "=> Make sure $(BIN_DIR) is in your PATH."

clean:
	@echo "=> Cleaning build artifacts..."
	rm -rf build/
	@echo "=> Clean complete."
