#include <pico/stdlib.h>
#include "hardware/gpio.h"
#include "hardware/adc.h"
#include "hardware/watchdog.h"
#include "hardware/clocks.h"
#include "hardware/regs/io_bank0.h"
#include "hardware/rosc.h"
#include "hardware/rtc.h"
#include "hardware/structs/scb.h"
#include "hardware/pll.h"

#include "pico/util/datetime.h"
#include <pico/sleep.h>

#define VOLTAGE_SAMPLES 1000
#define MICROSECONDS_PER_SECOND 1000000
#define SECONDS_PER_MINUTE 60
#define FIRMWARE_ENTRY 0x10000100


/* If a transmit rate of once every 60 minutes is desired, the  */
/* Traquito firmware will reboot to enter this code during the  */
/* last ten seconds of the transmit slot. If default telemetry  */
/* is used, that's slot 2 so we'll return here at 4 minutes     */
/* past the start of the transmission. To wake up early enough  */
/* to get a GPS lock, sleep for 60 - 4 (2 slots) - gps_lock and */
/* warm up time.                                                */
#define SLEEP_MINUTES 52

#define GPIO_VBUS 24

/* 
    GetVSYSVoltage
    
    returns measured voltage on V_SYS * 1000
    taking into account the voltage divider
    on the pico board
*/
unsigned int GetVSYSVoltage() {
    unsigned int voltage_raw_adc_sum = 0;

    adc_init();
    
    // Make sure GPIO is high-impedance, no pullups etc
    adc_gpio_init(29);
    
    //Select ADC input 3 (GPIO29) 
    //Pin samples (1/3) * V_SYS
    adc_select_input(3);

    // Sample the Y_SYS voltage a few times and average because 
    // a charging cycle may oscillate between battery voltage and 
    // a higher input voltage if the battery is disconnected

    for (int i = 0 ; i < VOLTAGE_SAMPLES ; ++i ) {
        voltage_raw_adc_sum += adc_read();
    }
    
    // Normalize sensed voltage to a 3.3V reference voltage and a maximum
    // value of (2^12)-1 and a 1/3 voltage divider
    unsigned int sensed_voltage = (voltage_raw_adc_sum * 33)/ (10 * ((1<<12)-1));
    unsigned int voltage = sensed_voltage * 3;

    return voltage;
}

static bool awake;

void sleep_callback(unsigned int alarm_num) {
    awake = true;
}

void SleepMinutes(unsigned int minutes) {
    sleep_run_from_xosc();

    sleep_goto_sleep_for(minutes * SECONDS_PER_MINUTE * 1000, &sleep_callback);
    
    // Restore the original state of the SCB and clock gates
    sleep_power_up();
}

void BootToFirmware(void) {
    *(unsigned int *)(0xe0000000 + 0xed08) = FIRMWARE_ENTRY;
    // First two words after the 256 byte XIP boot2 
    // are the processor mode settings and the entry vector
    unsigned int mode = *((unsigned int *)(FIRMWARE_ENTRY));
    unsigned int entry = *((unsigned int *)(FIRMWARE_ENTRY+4));

    // Inline assembly to mimic boot2 action
    __asm__ volatile (
        "msr msp, %[m]"        // Set mode bits
        :
        : [m] "r" (mode)
    );

    // Inline assembly to jump to the Thumb function
    __asm__ volatile (
        "BX %[addr]"        // Branch and exchange instruction
        :
        : [addr] "r" (entry | 1)
    );

    // Never gets here
}

/* use the watchdog to reset the pico */
void machine_reset(void) {
    watchdog_reboot(0, SRAM_END, 0);
    for (;;) {
        __asm__ volatile (
            "wfi"        // Wait for interrupt
        );
    }
}

/* callback to trigger a reset if VBUS presence detected */
void gpio_callback(uint gpio, uint32_t events) {
    // Very likely callback happened from a sleep state
    sleep_power_up();

    if (gpio == GPIO_VBUS) {
        machine_reset();
    }
}

int main(int argc, char *argv) {
    
    /* 
        Monitor the V_BUS pin (GPIO24) to detect 
        a rising edge -> solar or USB power appeared
    */
    gpio_init(GPIO_VBUS);

    /* 
        In flight mode, we're here because:

        - Main firmware has caused a reset because it wants to sleep
        - Power has been restored 
    */
    for (;;) {
        unsigned int voltage = GetVSYSVoltage();

        if ((voltage > 4100)) {
            // Fully charged or plugged in
            BootToFirmware();
        } 
    
        /* Triggered by either USB connection or solar power appearing */
        /* Low solar power is sufficient to trigger this because of the voltage */
        /* levels on the digital input */
        gpio_set_irq_enabled_with_callback(GPIO_VBUS, GPIO_IRQ_EDGE_RISE, true, &gpio_callback);

        if (voltage > 3200) {
            /* Sleep for a while */
            SleepMinutes(SLEEP_MINUTES);

            /* Attempt to run firmware only if voltage is above */
            /* a threshold after sleep                          */
            /* Jetpack has a reset monitor circuit that will    */
            /* assert reset at 2.6V V_SYS                       */
            if (GetVSYSVoltage() > 3000) {
                BootToFirmware();
            }
        } else {
            SleepMinutes(SLEEP_MINUTES);
        }
    }

    return 0;
}
