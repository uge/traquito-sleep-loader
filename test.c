#include <pico/stdlib.h>
#include "hardware/gpio.h"
#include "hardware/adc.h"

#define VOLTAGE_SAMPLES 1000
#define MICROSECONDS_PER_SECOND 1000000
#define SECONDS_PER_MINUTE 60
#define FIRMWARE_ENTRY 0x10000100

/* 
    GetVSYSVoltage
    
    returns measured voltage on V_SYS * 1000
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
    unsigned int sensed_voltage = (voltage_raw_adc_sum * 33)/ ( 10 * ((1<<12)-1) );
    unsigned int voltage = sensed_voltage * 3;

    return voltage;
}

void SleepMinutes(unsigned int minutes) {
    /* Current time in microseconds */
    absolute_time_t current_time = get_absolute_time();
    absolute_time_t sleep_duration = minutes * SECONDS_PER_MINUTE * MICROSECONDS_PER_SECOND;

    sleep_until(current_time + sleep_duration);
}

void BootToFirmware(void) {
    *(unsigned int *)(0xe0000000 + 0xed08) = FIRMWARE_ENTRY;
    // First two words after the 256 byte XIP boot2 
    // are the processor mode settings and the entry vector
    
    unsigned int mode = *((unsigned int *)(FIRMWARE_ENTRY));
    unsigned int entry = *((unsigned int *)(FIRMWARE_ENTRY+4));

    // Inline assembly to jump to the Thumb function
    __asm__ volatile (
        "msr msp, %[m]"        // Branch and exchange instruction
        :
        : [m] "r" (mode)
    );

    // Inline assembly to jump to the Thumb function
    __asm__ volatile (
        "BX %[addr]"        // Branch and exchange instruction
        :
        : [addr] "r" (entry | 1)
    );

}

int main(int argc, char *argv) {

    /* 
        In flight mode, we're here because:

        - Main firmware has caused a reset because it wants to sleep
        - Power has been restored 
    */

    // Is the battery essentially fully charger (or we're plugged in?)
    for (;;) {
        unsigned int voltage = GetVSYSVoltage();

        if (voltage > 4100) {
            BootToFirmware();
        } else if (voltage > 3000) {
            /* Sleep for a while */
            SleepMinutes(30);

            /* Attempt to run firmware only if voltage is above */
            /* a threshold after sleep                          */
            if (GetVSYSVoltage() > 2800) {
                BootToFirmware();
            }
        } else {
            SleepMinutes(30);
        }
    }

    return 0;
}
