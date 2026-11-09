using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TerraSinal.Web.Models;

namespace TerraSinal.Web.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<RegistoPrevisao> RegistosPrevisao => Set<RegistoPrevisao>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<ApplicationUser>(e =>
        {
            e.Property(u => u.FullName).HasMaxLength(200);
        });
        builder.Entity<RegistoPrevisao>(e =>
        {
            e.ToTable("RegistosPrevisao");
            e.HasIndex(r => new { r.Distrito, r.Ano, r.Mes });
            e.HasIndex(r => r.CriadoEmUtc);
        });
    }
}
