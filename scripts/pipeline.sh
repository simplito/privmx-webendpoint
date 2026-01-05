#!/bin/bash
set -e
set -o pipefail

SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )
source "$SCRIPT_PATH/build-manifest.sh"

# ==============================================================================
# CONFIGURATION
# ==============================================================================

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
BLUE=$(tput setaf 4)
GRAY=$(tput setaf 8 2>/dev/null || tput setaf 240)
RESET=$(tput sgr0)

# ==============================================================================
# BUILD FUNCTIONS (CI VS INTERACTIVE)
# ==============================================================================

if [ -n "$CI" ]; then
    echo "${BLUE}ℹ️  CI Environment detected. Disabling smart animations.${RESET}"

    # --------------------------------------
    # CI / SIMPLE MODE
    # --------------------------------------
    run_step() {
        local step_name="$1"
        shift
        local log_file="/tmp/build_${step_name// /_}.log"
        
        printf "${BLUE}⚙️  %s...${RESET}\n" "$step_name"

        # Run command, capture output to log file
        if "$@" > "$log_file" 2>&1; then
            printf "${GREEN}✔ %s - SUCCESS${RESET}\n" "$step_name"
            rm -f "$log_file"
        else
            printf "${RED}❌ %s - FAILED${RESET}\n" "$step_name"
            printf "${RED}==================== FAILURE LOGS ====================${RESET}\n"
            cat "$log_file"
            printf "${RED}======================================================${RESET}\n"
            rm -f "$log_file"
            exit 1
        fi
    }

else
    # --------------------------------------
    # INTERACTIVE / SMART MODE
    # --------------------------------------
    
    WINDOW_SIZE=20

    tput civis 

    cleanup() {
        tput cnorm
        rm -f /tmp/build_*.log /tmp/build_*.log.tmp
    }
    trap cleanup EXIT

    run_step() {
        local step_name="$1"
        shift
        
        local term_lines=$(tput lines)
        local term_cols=$(tput cols)
        
        local available_height=$((term_lines - 6))
        
        local WINDOW_SIZE=20
        if [ "$available_height" -lt 20 ]; then
            WINDOW_SIZE=$available_height
        fi
        if [ "$WINDOW_SIZE" -lt 5 ]; then
            WINDOW_SIZE=5
        fi

        local log_file="/tmp/build_${step_name}.log"
        local pid
        local spin='-\|/'
        local i=0
        local max_len=$((term_cols - 5))

        ("$@" > "$log_file" 2>&1) &
        pid=$!

        for ((k=0; k<WINDOW_SIZE; k++)); do echo ""; done

        while kill -0 "$pid" 2>/dev/null; do
            tput cuu "$WINDOW_SIZE"

            i=$(( (i+1) %4 ))
            printf "\r${BLUE}⚙️  %s... [%s]${RESET}" "$step_name" "${spin:$i:1}"
            tput el
            printf "\n"

            if [ -f "$log_file" ]; then
                tail -n $((WINDOW_SIZE - 1)) "$log_file" > "${log_file}.tmp"
                local line_count=$(wc -l < "${log_file}.tmp")
                line_count="${line_count##*( )}"

                while IFS= read -r line; do
                    short_line=$(echo "$line" | cut -c 1-"$max_len")
                    printf "${GRAY}  > %s${RESET}" "$short_line"
                    tput el 
                    printf "\n"
                done < "${log_file}.tmp"

                local remaining=$(( (WINDOW_SIZE - 1) - line_count ))
                for ((j=0; j<remaining; j++)); do
                    tput el; printf "\n"
                done
            else
                for ((j=0; j<(WINDOW_SIZE - 1); j++)); do
                    tput el; printf "\n"
                done
            fi
            sleep 0.1
        done

        set +e 
        wait "$pid"
        local exit_code=$?
        set -e 

        tput cuu "$WINDOW_SIZE"
        tput ed

        if [ $exit_code -eq 0 ]; then
            printf "${GREEN}✔ %s - SUCCESS${RESET}\n" "$step_name"
            rm -f "$log_file" "${log_file}.tmp"
        else
            printf "${RED}❌ %s - FAILED${RESET}\n" "$step_name"
            printf "${RED}==================== FAILURE LOGS (Last 100 lines) ====================${RESET}\n"
            
            printf "${RED}"
            if [ -f "$log_file" ]; then
                tail -n 100 "$log_file"
            fi
            printf "${RESET}\n"
            
            printf "${RED}=======================================================================${RESET}\n"
            rm -f "$log_file" "${log_file}.tmp"
            exit 1
        fi
    }
fi

# ==============================================================================
# EXECUTION
# ==============================================================================

echo "${BLUE}----------------------------------------"
echo " Starting Build Process..."
echo "---------------------------------------${RESET}"

run_step "Download and Install Emscripten SDK" "$SCRIPT_PATH/get_emsdk"
run_step "Build GMP Library" "$SCRIPT_PATH/build_gmp" $GMP
run_step "Build POCO C++ Libraries" "$SCRIPT_PATH/build_poco" $POCO
run_step "Build PSON C++ Library" "$SCRIPT_PATH/build_pson" $PSON_CPP
run_step "Build secp256k1 Cryptography Library" "$SCRIPT_PATH/build_secp"
run_step "Build Async Engine" "$SCRIPT_PATH/build_async_engine"
run_step "Build Web Browser Drivers" "$SCRIPT_PATH/build_webdrivers"
run_step "Build PrivMX Endpoint Module" "$SCRIPT_PATH/build_privmx_endpoint" $PRIVMX_ENDPOINT
run_step "Build Driver Web Context" "$SCRIPT_PATH/build_driver_web_context"
run_step "Build API Interface" "$SCRIPT_PATH/build_api" $PRIVMX_ENDPOINT
run_step "Add Built Assets to package" "$SCRIPT_PATH/move_wasm_assets"

echo "${BLUE}----------------------------------------"
printf " ALL BUILDS FINISHED SUCCESSFULLY\n"
echo "----------------------------------------${RESET}"