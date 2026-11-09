using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using TerraSinal.Web.Models;

namespace TerraSinal.Web.Data;

public static class SeedData
{
    public static async Task InitializeAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

        string[] roles = { "Administrador", "Investigador" };
        foreach (var role in roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }

        // Conta administrador de demonstração
        const string adminEmail = "admin@terrasinal.mz";
        const string adminPassword = "Admin@2026";

        var admin = await userManager.FindByEmailAsync(adminEmail);
        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                FullName = "Administrador TERRA.SINAL",
                EmailConfirmed = true,
                CreatedAt = DateTime.UtcNow
            };
            var result = await userManager.CreateAsync(admin, adminPassword);
            if (result.Succeeded)
                await userManager.AddToRoleAsync(admin, "Administrador");
        }

        // Conta investigador de demonstração
        const string invEmail = "investigador@terrasinal.mz";
        const string invPassword = "Invest@2026";

        var inv = await userManager.FindByEmailAsync(invEmail);
        if (inv is null)
        {
            inv = new ApplicationUser
            {
                UserName = invEmail,
                Email = invEmail,
                FullName = "Investigador Demo",
                EmailConfirmed = true,
                CreatedAt = DateTime.UtcNow
            };
            var result = await userManager.CreateAsync(inv, invPassword);
            if (result.Succeeded)
                await userManager.AddToRoleAsync(inv, "Investigador");
        }
    }
}
