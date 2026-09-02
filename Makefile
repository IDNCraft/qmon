.PHONY: build install clean mobile-dev

# Default OS to Linux if not specified, but this should be run natively or via scripts/install.sh
OS ?= $(shell uname -s | tr A-Z a-z)
ARCH ?= $(shell uname -m)
BIN_DIR = $(HOME)/.local/bin
HOST_IP ?=

build: build-api build-cli

ifneq ($(strip $(HOST_IP)),)
mobile-dev:
	@echo "=> Running mobile dev against http://$(HOST_IP):8080";
	cd mobile && flutter run --dart-define=QMON_API_URL=http://$(HOST_IP):8080
else ifeq ($(OS),Windows_NT)
mobile-dev:
	@echo "Unable to detect host IP on Windows. Run: make mobile-dev HOST_IP=<host-ip>";
	@exit /b 1
else
mobile-dev:
	@host_ip="$(HOST_IP)"; \
	if [ -z "$$host_ip" ]; then \
		case "$(OS)" in \
			darwin) host_ip="$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)" ;; \
			linux) host_ip="$$(hostname -I 2>/dev/null | awk '{print $$1}')" ;; \
		esac; \
	fi; \
	if [ -z "$$host_ip" ]; then \
		echo "Unable to detect host IP. Run: make mobile-dev HOST_IP=<host-ip>" >&2; \
		exit 1; \
	fi; \
	echo "=> Running mobile dev against http://$$host_ip:8080"; \
	cd mobile && flutter run --dart-define=QMON_API_URL=http://$$host_ip:8080
endif

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
	# Replace via unlink+copy and re-sign ad-hoc: overwriting the inode in
	# place invalidates the linker/ad-hoc signature and macOS SIGKILLs the
	# binary ("zsh: killed qmon"), especially after `qmon update`.
	rm -f $(BIN_DIR)/qmon-server $(BIN_DIR)/qmon
	cp build/qmon-server $(BIN_DIR)/qmon-server
	cp build/qmon $(BIN_DIR)/qmon
ifeq ($(OS),darwin)
	codesign --force --sign - $(BIN_DIR)/qmon-server
	codesign --force --sign - $(BIN_DIR)/qmon
endif
	@echo "=> Installation complete!"
	@echo "=> Make sure $(BIN_DIR) is in your PATH."

clean:
	@echo "=> Cleaning build artifacts..."
	rm -rf build/
	@echo "=> Clean complete."
